import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { createServer as createTlsServer, connect as tlsConnect } from 'node:tls';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

import chalk from 'chalk';

import type { Config } from '../config.js';
import { expandHome } from '../config.js';
import type { Fixture } from '../fixtures/fixture-store.js';
import { FixtureStore } from '../fixtures/fixture-store.js';
import { sanitizeHeaders } from '../fixtures/sanitizer.js';
import { type CAKeyPair, generateServerCert, loadCA } from './ca.js';
import { extractGraphQLOperation } from './graphql-parser.js';
import { buildRequestKey, requestKeyToFixturePath } from './request-matcher.js';

export type ProxyMode = 'record' | 'mock';

interface TlsServerEntry {
	port: number;
}

export class MitmProxy {
	private readonly store: FixtureStore;
	private readonly ca: CAKeyPair;
	private readonly tlsServers = new Map<string, TlsServerEntry>();

	constructor(
		private readonly mode: ProxyMode,
		private readonly config: Config,
	) {
		this.store = new FixtureStore(expandHome(config.fixturesDir));
		this.ca = loadCA(expandHome(config.caDir));
	}

	start(): void {
		const server = createHttpServer();

		server.on('connect', (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
			this.handleConnect(req, clientSocket, head);
		});

		server.on('request', (req: IncomingMessage, res: ServerResponse) => {
			this.handleHttpRequest(req, res);
		});

		server.listen(this.config.port, () => {
			console.log(
				chalk.green(`n8n-node-mocker proxy started on port ${this.config.port} [${this.mode} mode]`),
			);
			console.log(chalk.dim(`Fixtures directory: ${expandHome(this.config.fixturesDir)}`));
			console.log();
		});
	}

	/**
	 * Handles CONNECT tunneling for HTTPS. Creates a per-hostname TLS server
	 * that presents a certificate signed by our CA.
	 */
	private handleConnect(req: IncomingMessage, clientSocket: Socket, head: Buffer): void {
		const [hostname, portStr] = (req.url ?? '').split(':');
		const port = parseInt(portStr ?? '443', 10);

		this.getOrCreateTlsServer(hostname, port).then((entry) => {
			clientSocket.write(
				'HTTP/1.1 200 Connection Established\r\n\r\n',
			);

			const proxySocket = tlsConnect(
				{ host: '127.0.0.1', port: entry.port, rejectUnauthorized: false },
				() => {
					if (head.length > 0) proxySocket.write(head);
					clientSocket.pipe(proxySocket);
					proxySocket.pipe(clientSocket);
				},
			);

			proxySocket.on('error', () => clientSocket.destroy());
			clientSocket.on('error', () => proxySocket.destroy());
		});
	}

	private async getOrCreateTlsServer(
		hostname: string,
		targetPort: number,
	): Promise<TlsServerEntry> {
		const existing = this.tlsServers.get(hostname);
		if (existing) return existing;

		const { cert, key } = generateServerCert(hostname, this.ca.certPem, this.ca.keyPem);

		return new Promise((resolve) => {
			const tlsServer = createTlsServer({ cert, key }, (socket) => {
				let data = Buffer.alloc(0);

				const onData = (chunk: Buffer): void => {
					data = Buffer.concat([data, chunk]);
					const headerEnd = data.indexOf('\r\n\r\n');
					if (headerEnd === -1) return;

					socket.removeListener('data', onData);

					const headerStr = data.subarray(0, headerEnd).toString();
					const bodyBuf = data.subarray(headerEnd + 4);
					const lines = headerStr.split('\r\n');
					const [method, path] = lines[0].split(' ');
					const headers: Record<string, string> = {};

					for (let i = 1; i < lines.length; i++) {
						const colonIdx = lines[i].indexOf(':');
						if (colonIdx > 0) {
							headers[lines[i].substring(0, colonIdx).trim().toLowerCase()] =
								lines[i].substring(colonIdx + 1).trim();
						}
					}

					const contentLength = parseInt(headers['content-length'] ?? '0', 10);
					const remainingBytes = contentLength - bodyBuf.length;

					if (remainingBytes > 0) {
						const chunks: Buffer[] = [bodyBuf];
						let received = bodyBuf.length;
						const bodyCollector = (bodyChunk: Buffer): void => {
							chunks.push(bodyChunk);
							received += bodyChunk.length;
							if (received >= contentLength) {
								socket.removeListener('data', bodyCollector);
								const fullBody = Buffer.concat(chunks).subarray(0, contentLength);
								this.processInterceptedRequest(
									hostname, targetPort, method!, path!, headers, fullBody, socket,
								);
							}
						};
						socket.on('data', bodyCollector);
					} else {
						this.processInterceptedRequest(
							hostname, targetPort, method!, path!, headers, bodyBuf.subarray(0, contentLength), socket,
						);
					}
				};

				socket.on('data', onData);
				socket.on('error', () => {});
			});

			tlsServer.listen(0, '127.0.0.1', () => {
				const addr = tlsServer.address();
				const port = typeof addr === 'object' && addr ? addr.port : 0;
				const entry: TlsServerEntry = { port };
				this.tlsServers.set(hostname, entry);
				resolve(entry);
			});
		});
	}

	private processInterceptedRequest(
		hostname: string,
		targetPort: number,
		method: string,
		path: string,
		headers: Record<string, string>,
		body: Buffer,
		clientSocket: import('node:tls').TLSSocket,
	): void {
		const bodyStr = body.length > 0 ? body.toString('utf-8') : undefined;

		if (this.mode === 'mock') {
			this.serveMock(hostname, method, path, headers, bodyStr, clientSocket);
		} else {
			this.recordRequest(hostname, targetPort, method, path, headers, body, bodyStr, clientSocket);
		}
	}

	private serveMock(
		hostname: string,
		method: string,
		path: string,
		_headers: Record<string, string>,
		bodyStr: string | undefined,
		clientSocket: import('node:tls').TLSSocket,
	): void {
		const operationName = bodyStr ? extractGraphQLOperation(bodyStr) : null;
		const fixture = this.store.findFixture(hostname, path, method, operationName);

		const label = operationName
			? `${method} ${hostname}${path} [${operationName}]`
			: `${method} ${hostname}${path}`;

		if (fixture) {
			console.log(chalk.blue(`MOCKED: ${label} -> ${fixture.response.statusCode}`));
			this.sendResponse(clientSocket, fixture.response.statusCode, fixture.response.headers, fixture.response.body);
		} else {
			console.log(chalk.red(`NO FIXTURE: ${label}`));
			this.sendResponse(clientSocket, 501, { 'content-type': 'application/json' }, {
				error: `No fixture for ${label}. Run in record mode first or create a fixture manually.`,
			});
		}
	}

	private recordRequest(
		hostname: string,
		targetPort: number,
		method: string,
		path: string,
		headers: Record<string, string>,
		body: Buffer,
		bodyStr: string | undefined,
		clientSocket: import('node:tls').TLSSocket,
	): void {
		const targetSocket = tlsConnect(
			{ host: hostname, port: targetPort, servername: hostname },
			() => {
				const reqHeaders = { ...headers, host: hostname };
				let reqLine = `${method} ${path} HTTP/1.1\r\n`;
				for (const [k, v] of Object.entries(reqHeaders)) {
					reqLine += `${k}: ${v}\r\n`;
				}
				reqLine += '\r\n';
				targetSocket.write(reqLine);
				if (body.length > 0) targetSocket.write(body);
			},
		);

		let responseData = Buffer.alloc(0);
		targetSocket.on('data', (chunk: Buffer) => {
			responseData = Buffer.concat([responseData, chunk]);
		});

		targetSocket.on('end', () => {
			const headerEnd = responseData.indexOf('\r\n\r\n');
			if (headerEnd === -1) {
				clientSocket.end();
				return;
			}

			const respHeaderStr = responseData.subarray(0, headerEnd).toString();
			const respBody = responseData.subarray(headerEnd + 4);
			const respLines = respHeaderStr.split('\r\n');
			const statusMatch = respLines[0].match(/HTTP\/\d\.\d (\d+)/);
			const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 500;
			const respHeaders: Record<string, string> = {};

			for (let i = 1; i < respLines.length; i++) {
				const colonIdx = respLines[i].indexOf(':');
				if (colonIdx > 0) {
					respHeaders[respLines[i].substring(0, colonIdx).trim().toLowerCase()] =
						respLines[i].substring(colonIdx + 1).trim();
				}
			}

			let respBodyParsed: unknown;
			try {
				respBodyParsed = JSON.parse(respBody.toString('utf-8'));
			} catch {
				respBodyParsed = respBody.toString('utf-8');
			}

			let reqBodyParsed: unknown;
			if (bodyStr) {
				try { reqBodyParsed = JSON.parse(bodyStr); } catch { reqBodyParsed = bodyStr; }
			}

			const operationName = bodyStr ? extractGraphQLOperation(bodyStr) : null;
			const key = buildRequestKey(hostname, method, path, bodyStr);
			const fixturePath = requestKeyToFixturePath(key);

			const fixture: Fixture = {
				request: {
					method,
					host: hostname,
					path,
					headers: sanitizeHeaders(headers),
					body: reqBodyParsed,
				},
				response: {
					statusCode,
					headers: respHeaders,
					body: respBodyParsed,
				},
				operationName: operationName ?? undefined,
				recordedAt: new Date().toISOString(),
			};

			const savedPath = this.store.save(fixturePath, fixture);
			const label = operationName
				? `${method} ${hostname}${path} [${operationName}]`
				: `${method} ${hostname}${path}`;
			console.log(chalk.green(`RECORDED: ${label} -> ${statusCode}`));
			console.log(chalk.dim(`  -> ${savedPath}`));

			// Forward the raw response back to the client
			clientSocket.write(responseData);
			clientSocket.end();
		});

		targetSocket.on('error', (err) => {
			console.log(chalk.red(`UPSTREAM ERROR: ${hostname}${path} - ${err.message}`));
			this.sendResponse(clientSocket, 502, { 'content-type': 'application/json' }, {
				error: `Failed to connect to upstream: ${err.message}`,
			});
		});
	}

	private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
		// Plain HTTP proxy (non-CONNECT), rarely used for APIs but handle it
		const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
		const label = `${req.method} ${url.hostname}${url.pathname}`;
		console.log(chalk.dim(`HTTP (non-TLS): ${label} - passing through`));

		const proxyReq = httpRequest(
			{
				hostname: url.hostname,
				port: url.port || 80,
				path: url.pathname + url.search,
				method: req.method,
				headers: req.headers,
			},
			(proxyRes) => {
				res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
				proxyRes.pipe(res);
			},
		);

		req.pipe(proxyReq);
		proxyReq.on('error', (err) => {
			res.writeHead(502);
			res.end(`Proxy error: ${err.message}`);
		});
	}

	private sendResponse(
		socket: import('node:tls').TLSSocket,
		statusCode: number,
		headers: Record<string, string>,
		body: unknown,
	): void {
		const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
		const bodyBuf = Buffer.from(bodyStr);

		let response = `HTTP/1.1 ${statusCode} ${statusCode === 200 ? 'OK' : 'Error'}\r\n`;
		for (const [k, v] of Object.entries(headers)) {
			response += `${k}: ${v}\r\n`;
		}
		response += `content-length: ${bodyBuf.length}\r\n`;
		response += '\r\n';

		socket.write(response);
		socket.write(bodyBuf);
		socket.end();
	}
}
