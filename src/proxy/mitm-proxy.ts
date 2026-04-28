import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { connect as netConnect } from 'node:net';
import { createServer as createTlsServer } from 'node:tls';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

import chalk from 'chalk';

import type { Config } from '../config.js';
import { expandHome } from '../config.js';
import { FixtureStore } from '../fixtures/fixture-store.js';
import { type CAKeyPair, generateServerCert, loadCA } from './ca.js';
import { extractGraphQLOperation } from './graphql-parser.js';

interface TlsServerEntry {
	port: number;
}

export class MitmProxy {
	private readonly store: FixtureStore;
	private readonly ca: CAKeyPair;
	private readonly tlsServers = new Map<string, TlsServerEntry>();
	private readonly pendingTlsServers = new Map<string, Promise<TlsServerEntry>>();

	constructor(private readonly config: Config) {
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

		server.on('error', (err) => {
			console.error(chalk.red(`Proxy server error: ${err.message}`));
		});

		server.listen(this.config.port, '::', () => {
			console.log(
				chalk.green(`n8n-node-mocker proxy started on port ${this.config.port}`),
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

		console.log(chalk.dim(`CONNECT ${hostname}:${port}`));

		this.getOrCreateTlsServer(hostname).then((entry) => {
			clientSocket.write(
				'HTTP/1.1 200 Connection Established\r\n\r\n',
			);

			const proxySocket = netConnect({ host: '127.0.0.1', port: entry.port }, () => {
				if (head.length > 0) proxySocket.write(head);
				clientSocket.pipe(proxySocket);
				proxySocket.pipe(clientSocket);
			});

			proxySocket.on('error', (err) => {
				console.log(chalk.red(`Proxy socket error for ${hostname}: ${err.message}`));
				clientSocket.destroy();
			});
			clientSocket.on('error', (err) => {
				console.log(chalk.red(`Client socket error for ${hostname}: ${err.message}`));
				proxySocket.destroy();
			});
		}).catch((err) => {
			console.error(chalk.red(`Failed to create TLS server for ${hostname}: ${(err as Error).message}`));
			clientSocket.destroy();
		});
	}

	private async getOrCreateTlsServer(hostname: string): Promise<TlsServerEntry> {
		const existing = this.tlsServers.get(hostname);
		if (existing) return existing;

		const pending = this.pendingTlsServers.get(hostname);
		if (pending) return pending;

		const promise = this.createTlsServer(hostname);
		this.pendingTlsServers.set(hostname, promise);
		promise.then(() => this.pendingTlsServers.delete(hostname));

		return promise;
	}

	private createTlsServer(hostname: string): Promise<TlsServerEntry> {
		const { cert, key } = generateServerCert(hostname, this.ca.certPem, this.ca.keyPem);

		return new Promise((resolve) => {
			const tlsServer = createTlsServer({ cert, key }, (socket) => {
				console.log(chalk.dim(`  TLS session established for ${hostname}`));
				let data = Buffer.alloc(0);
				let requestParsed = false;

				const onData = (chunk: Buffer): void => {
					data = Buffer.concat([data, chunk]);
					const headerEnd = data.indexOf('\r\n\r\n');
					if (headerEnd === -1) {
						if (data.length > 64 * 1024) {
							console.log(chalk.red(`  Headers too large for ${hostname} (${data.length} bytes), dropping`));
							socket.destroy();
						}
						return;
					}

					requestParsed = true;
					socket.removeListener('data', onData);

					const headerStr = data.subarray(0, headerEnd).toString();
					const bodyBuf = data.subarray(headerEnd + 4);
					const lines = headerStr.split('\r\n');
					const [method, path] = lines[0].split(' ');
					console.log(chalk.dim(`  -> ${method} ${hostname}${path}`));
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
						console.log(chalk.dim(`  -> waiting for body: ${bodyBuf.length}/${contentLength} bytes`));
						const chunks: Buffer[] = [bodyBuf];
						let received = bodyBuf.length;
						const bodyCollector = (bodyChunk: Buffer): void => {
							chunks.push(bodyChunk);
							received += bodyChunk.length;
							if (received >= contentLength) {
								socket.removeListener('data', bodyCollector);
								const fullBody = Buffer.concat(chunks).subarray(0, contentLength);
								this.serveMock(hostname, method!, path!, headers, fullBody, socket);
							}
						};
						socket.on('data', bodyCollector);
					} else {
						this.serveMock(hostname, method!, path!, headers, bodyBuf.subarray(0, contentLength), socket);
					}
				};

				socket.on('data', onData);
				socket.on('close', () => {
					if (!requestParsed) {
						console.log(chalk.red(`  Socket closed before request was parsed for ${hostname} (buffered ${data.length} bytes)`));
					}
				});
				socket.on('error', (err) => {
					console.log(chalk.red(`  TLS socket error for ${hostname}: ${err.message}`));
				});
			});

			tlsServer.on('tlsClientError', (err) => {
				console.log(chalk.red(`  TLS handshake failed for ${hostname}: ${err.message}`));
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

	private serveMock(
		hostname: string,
		method: string,
		path: string,
		_headers: Record<string, string>,
		body: Buffer,
		clientSocket: import('node:tls').TLSSocket,
	): void {
		const bodyStr = body.length > 0 ? body.toString('utf-8') : undefined;
		const operationName = bodyStr ? extractGraphQLOperation(bodyStr) : null;
		const fixture = this.store.findFixture(hostname, path, method, operationName);

		const label = operationName
			? `${method} ${hostname}${path} [${operationName}]`
			: `${method} ${hostname}${path}`;

		if (fixture) {
			console.log(chalk.blue(`MOCKED: ${label} -> ${fixture.response.statusCode}`));
			this.sendResponse(clientSocket, fixture.response.statusCode, fixture.response.headers, fixture.response.body);
		} else if (this.config.fallbackMode === 'auto') {
			const fallback = this.buildSmartFallback(method, path, bodyStr);
			console.log(chalk.yellow(`FALLBACK: ${label} -> 200 (auto)`));
			this.sendResponse(clientSocket, 200, { 'content-type': 'application/json' }, fallback);
		} else {
			console.log(chalk.red(`NO FIXTURE: ${label}`));
			this.sendResponse(clientSocket, 501, { 'content-type': 'application/json' }, {
				error: `No fixture for ${label}. Create a fixture file manually.`,
			});
		}
	}

	private buildSmartFallback(
		method: string,
		path: string,
		bodyStr: string | undefined,
	): unknown {
		const isGraphQL = bodyStr ? extractGraphQLOperation(bodyStr) !== null : false;

		if (isGraphQL) {
			return { data: {} };
		}

		const upper = method.toUpperCase();

		if (upper === 'GET') {
			const lastSegment = path.split('/').filter(Boolean).pop() ?? '';
			const looksLikeSingular = /^[a-f0-9-]{20,}$/.test(lastSegment) || /^\d+$/.test(lastSegment);
			if (looksLikeSingular) {
				return { id: lastSegment, name: 'Mock Resource', status: 'active' };
			}
			return [];
		}

		if (upper === 'POST') {
			return { id: `mock-${randomUUID()}`, success: true };
		}

		if (upper === 'PUT' || upper === 'PATCH') {
			return { success: true, updated: true };
		}

		if (upper === 'DELETE') {
			return { success: true, deleted: true };
		}

		if (upper === 'HEAD' || upper === 'OPTIONS') {
			return '';
		}

		return { ok: true };
	}

	private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
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
		if (socket.destroyed || !socket.writable) return;

		const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
		const bodyBuf = Buffer.from(bodyStr);

		const STATUS_TEXT: Record<number, string> = {
			200: 'OK', 201: 'Created', 204: 'No Content',
			400: 'Bad Request', 401: 'Unauthorized', 404: 'Not Found',
			500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway',
		};
		let response = `HTTP/1.1 ${statusCode} ${STATUS_TEXT[statusCode] ?? 'OK'}\r\n`;
		for (const [k, v] of Object.entries(headers)) {
			response += `${k}: ${v}\r\n`;
		}
		response += `content-length: ${bodyBuf.length}\r\n`;
		response += 'connection: close\r\n';
		response += '\r\n';

		socket.write(response);
		socket.write(bodyBuf);
		socket.end();
	}
}
