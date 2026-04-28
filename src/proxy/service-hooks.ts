import { writeFileSync, mkdirSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';

import chalk from 'chalk';

import type { Config } from '../config.js';
import { expandHome } from '../config.js';

/**
 * Service-specific side effects that run after a mock response is sent.
 *
 * Some APIs have custom handshake or callback flows that go beyond simple
 * request/response mocking. Add new hooks here as needed.
 */
export interface ServiceHookContext {
	hostname: string;
	method: string;
	path: string;
	bodyStr: string | undefined;
	config: Config;
}

type HookFn = (ctx: ServiceHookContext) => void;

interface ServiceHook {
	match: (ctx: ServiceHookContext) => boolean;
	run: HookFn;
}

const hooks: ServiceHook[] = [
	{
		match: (ctx) =>
			ctx.hostname === 'app.asana.com' &&
			ctx.method === 'POST' &&
			ctx.path.endsWith('/webhooks') &&
			ctx.bodyStr !== undefined,
		run: asanaHandshake,
	},
	{
		match: (ctx) =>
			ctx.hostname === 'api.figma.com' &&
			ctx.method === 'POST' &&
			ctx.path.endsWith('/webhooks') &&
			ctx.bodyStr !== undefined,
		run: figmaCapturePasscode,
	},
];

export function runPostResponseHooks(ctx: ServiceHookContext): void {
	for (const hook of hooks) {
		if (hook.match(ctx)) {
			hook.run(ctx);
		}
	}
}

/**
 * Asana webhook handshake.
 *
 * After n8n registers a webhook via POST /webhooks, Asana sends a
 * confirmation request back to n8n's webhook URL with X-Hook-Secret.
 * n8n stores this secret and uses it to verify all future webhook events.
 *
 * @see https://developers.asana.com/docs/webhooks-guide#the-webhook-handshake
 */
function asanaHandshake(ctx: ServiceHookContext): void {
	try {
		const body = JSON.parse(ctx.bodyStr!) as { data?: { target?: string }; target?: string };
		const target = body.data?.target ?? body.target;
		if (!target || typeof target !== 'string') return;

		const secret = ctx.config.services.asana?.signingSecret ?? 'test';

		setTimeout(() => {
			console.log(chalk.magenta(`ASANA HANDSHAKE: sending X-Hook-Secret to ${target}`));
			const url = new URL(target);
			const postData = JSON.stringify({});
			const req = httpRequest(
				{
					hostname: url.hostname,
					port: url.port || 80,
					path: url.pathname + url.search,
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						'content-length': Buffer.byteLength(postData),
						'x-hook-secret': secret,
					},
				},
				(res) => {
					const returnedSecret = res.headers['x-hook-secret'];
					if (returnedSecret) {
						console.log(chalk.magenta(`ASANA HANDSHAKE: n8n echoed X-Hook-Secret ✓`));
					} else {
						console.log(chalk.yellow(`ASANA HANDSHAKE: n8n responded ${res.statusCode} (no X-Hook-Secret echo)`));
					}
					res.resume();
				},
			);
			req.on('error', (err) => {
				console.log(chalk.red(`ASANA HANDSHAKE: failed to reach ${target}: ${err.message}`));
			});
			req.write(postData);
			req.end();
		}, 500);
	} catch {
		// Body wasn't JSON or didn't have target
	}
}

/**
 * Figma passcode capture.
 *
 * When n8n registers a Figma webhook, it generates a random passcode and
 * sends it in the POST body. n8n stores this passcode and verifies it on
 * every incoming event. We capture it so `webhook fire` can use the same
 * passcode instead of a static value.
 *
 * The passcode is saved to ~/.n8n-node-mocker/figma-passcode.txt
 *
 * @see https://developers.figma.com/docs/rest-api/webhooks-security/
 */
function figmaCapturePasscode(ctx: ServiceHookContext): void {
	try {
		const body = JSON.parse(ctx.bodyStr!) as { passcode?: string; data?: { passcode?: string } };
		const passcode = body.passcode ?? body.data?.passcode;
		if (!passcode || typeof passcode !== 'string') return;

		const dir = expandHome(ctx.config.caDir);
		mkdirSync(dir, { recursive: true });
		const filePath = join(dir, 'figma-passcode.txt');
		writeFileSync(filePath, passcode);

		console.log(chalk.magenta(`FIGMA: captured passcode -> ${filePath}`));
		console.log(chalk.magenta(`FIGMA: use --secret-file ${filePath} or it will be auto-detected`));
	} catch {
		// Body wasn't JSON
	}
}
