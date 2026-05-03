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
	{
		match: (ctx) =>
			ctx.method === 'POST' &&
			ctx.path.includes('/api/v4/projects/') &&
			ctx.path.endsWith('/hooks') &&
			ctx.bodyStr !== undefined,
		run: gitlabCaptureToken,
	},
	{
		match: (ctx) =>
			ctx.hostname === 'api.netlify.com' &&
			ctx.method === 'POST' &&
			ctx.path.endsWith('/hooks') &&
			ctx.bodyStr !== undefined,
		run: netlifyCaptureSecret,
	},
	{
		match: (ctx) =>
			ctx.hostname === 'api.calendly.com' &&
			ctx.method === 'POST' &&
			ctx.path.endsWith('/webhook_subscriptions') &&
			ctx.bodyStr !== undefined,
		run: calendlyCaptureSigningKey,
	},
	{
		match: (ctx) =>
			ctx.hostname === 'api.cal.com' &&
			ctx.method === 'POST' &&
			(ctx.path.endsWith('/webhooks') || ctx.path.endsWith('/hooks')) &&
			ctx.bodyStr !== undefined,
		run: calCaptureSecret,
	},
	{
		match: (ctx) =>
			ctx.hostname === 'api.taiga.io' &&
			ctx.method === 'POST' &&
			ctx.path.endsWith('/webhooks') &&
			ctx.bodyStr !== undefined,
		run: taigaCaptureKey,
	},
	{
		match: (ctx) =>
			ctx.hostname === 'www.formstack.com' &&
			ctx.method === 'POST' &&
			ctx.path.endsWith('/webhook.json') &&
			ctx.bodyStr !== undefined,
		run: formstackCaptureHmacSecret,
	},
	{
		match: (ctx) =>
			ctx.method === 'POST' &&
			ctx.path.endsWith('/api/hooks/new') &&
			ctx.bodyStr !== undefined,
		run: mauticCaptureSecret,
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
/**
 * GitLab webhook token capture.
 *
 * When n8n registers a GitLab webhook, it generates a random 64-char hex
 * token via `randomBytes(32).toString('hex')` and sends it in the POST body
 * as `token`. n8n stores this token and compares it with the `X-Gitlab-Token`
 * header on every incoming webhook event. We capture it so `webhook fire`
 * can use the same token.
 *
 * The token is saved to ~/.n8n-node-mocker/gitlab-token.txt
 *
 * @see https://docs.gitlab.com/ee/user/project/integrations/webhooks.html
 */
function gitlabCaptureToken(ctx: ServiceHookContext): void {
	try {
		const body = JSON.parse(ctx.bodyStr!) as { token?: string };
		const token = body.token;
		if (!token || typeof token !== 'string') return;

		const dir = expandHome(ctx.config.caDir);
		mkdirSync(dir, { recursive: true });
		const filePath = join(dir, 'gitlab-token.txt');
		writeFileSync(filePath, token);

		console.log(chalk.magenta(`GITLAB: captured webhook token -> ${filePath}`));
		console.log(chalk.magenta(`GITLAB: will be auto-detected by 'webhook fire --service gitlab'`));
	} catch {
		// Body wasn't JSON
	}
}

/**
 * Netlify webhook secret capture.
 *
 * When n8n registers a Netlify webhook, it generates a random 64-char hex
 * secret and sends it as `data.signature_secret` in the POST body. n8n
 * stores this secret and uses it to verify the JWT (HS256) in the
 * `X-Webhook-Signature` header on every incoming event.
 *
 * The secret is saved to ~/.n8n-node-mocker/netlify-secret.txt
 *
 * @see https://docs.netlify.com/site-deploys/notifications/#payload-signature
 */
function netlifyCaptureSecret(ctx: ServiceHookContext): void {
	try {
		const body = JSON.parse(ctx.bodyStr!) as { data?: { signature_secret?: string } };
		const secret = body.data?.signature_secret;
		if (!secret || typeof secret !== 'string') return;

		const dir = expandHome(ctx.config.caDir);
		mkdirSync(dir, { recursive: true });
		const filePath = join(dir, 'netlify-secret.txt');
		writeFileSync(filePath, secret);

		console.log(chalk.magenta(`NETLIFY: captured webhook secret -> ${filePath}`));
		console.log(chalk.magenta(`NETLIFY: will be auto-detected by 'webhook fire --service netlify'`));
	} catch {
		// Body wasn't JSON
	}
}

/**
 * Calendly webhook signing key capture.
 *
 * When n8n registers a Calendly webhook subscription (Access Token auth),
 * it generates a random 64-char hex signing_key and sends it in the POST
 * body. n8n stores this in workflow static data and uses it to verify the
 * HMAC-SHA256 signature in the `Calendly-Webhook-Signature` header.
 *
 * The key is saved to ~/.n8n-node-mocker/calendly-signing-key.txt
 *
 * @see https://developer.calendly.com/api-docs/4c305798a61d3-webhook-signatures
 */
function calendlyCaptureSigningKey(ctx: ServiceHookContext): void {
	try {
		const body = JSON.parse(ctx.bodyStr!) as { signing_key?: string };
		const signingKey = body.signing_key;
		if (!signingKey || typeof signingKey !== 'string') return;

		const dir = expandHome(ctx.config.caDir);
		mkdirSync(dir, { recursive: true });
		const filePath = join(dir, 'calendly-signing-key.txt');
		writeFileSync(filePath, signingKey);

		console.log(chalk.magenta(`CALENDLY: captured signing key -> ${filePath}`));
		console.log(chalk.magenta(`CALENDLY: will be auto-detected by 'webhook fire --service calendly'`));
	} catch {
		// Body wasn't JSON
	}
}

/**
 * Cal.com webhook secret capture.
 *
 * When n8n registers a Cal.com webhook, it generates a random 64-char hex
 * secret and sends it in the POST body as `secret`. n8n stores this in
 * workflow static data and uses it to verify the HMAC-SHA256 signature
 * in the `X-Cal-Signature-256` header.
 *
 * The secret is saved to ~/.n8n-node-mocker/cal-secret.txt
 *
 * @see https://cal.com/docs/core-features/webhooks
 */
function calCaptureSecret(ctx: ServiceHookContext): void {
	try {
		const body = JSON.parse(ctx.bodyStr!) as { secret?: string };
		const secret = body.secret;
		if (!secret || typeof secret !== 'string') return;

		const dir = expandHome(ctx.config.caDir);
		mkdirSync(dir, { recursive: true });
		const filePath = join(dir, 'cal-secret.txt');
		writeFileSync(filePath, secret);

		console.log(chalk.magenta(`CAL: captured webhook secret -> ${filePath}`));
		console.log(chalk.magenta(`CAL: will be auto-detected by 'webhook fire --service cal'`));
	} catch {
		// Body wasn't JSON
	}
}

/**
 * Taiga webhook key capture.
 *
 * When n8n registers a Taiga webhook, it computes a key as
 * `MD5(username + "," + password)` and sends it in the POST body as `key`.
 * n8n stores this in workflow static data and uses it to verify the
 * HMAC-SHA1 signature in the `X-TAIGA-WEBHOOK-SIGNATURE` header.
 *
 * The key is saved to ~/.n8n-node-mocker/taiga-key.txt
 *
 * @see https://docs.taiga.io/webhooks.html
 */
function taigaCaptureKey(ctx: ServiceHookContext): void {
	try {
		const body = JSON.parse(ctx.bodyStr!) as { key?: string };
		const key = body.key;
		if (!key || typeof key !== 'string') return;

		const dir = expandHome(ctx.config.caDir);
		mkdirSync(dir, { recursive: true });
		const filePath = join(dir, 'taiga-key.txt');
		writeFileSync(filePath, key);

		console.log(chalk.magenta(`TAIGA: captured webhook key -> ${filePath}`));
		console.log(chalk.magenta(`TAIGA: will be auto-detected by 'webhook fire --service taiga'`));
	} catch {
		// Body wasn't JSON
	}
}

/**
 * Formstack webhook HMAC secret capture.
 *
 * When n8n registers a Formstack webhook, it generates a random 64-char hex
 * secret via `randomBytes(32).toString('hex')` and sends it in the POST body
 * as `hmac_secret`. n8n stores this in workflow static data and uses it to
 * verify the HMAC-SHA256 signature in the `X-FS-Signature` header.
 *
 * The secret is saved to ~/.n8n-node-mocker/formstack-secret.txt
 *
 * @see https://developers.formstack.com/reference/webhook
 */
function formstackCaptureHmacSecret(ctx: ServiceHookContext): void {
	try {
		const body = JSON.parse(ctx.bodyStr!) as { hmac_secret?: string };
		const secret = body.hmac_secret;
		if (!secret || typeof secret !== 'string') return;

		const dir = expandHome(ctx.config.caDir);
		mkdirSync(dir, { recursive: true });
		const filePath = join(dir, 'formstack-secret.txt');
		writeFileSync(filePath, secret);

		console.log(chalk.magenta(`FORMSTACK: captured hmac_secret -> ${filePath}`));
		console.log(chalk.magenta(`FORMSTACK: will be auto-detected by 'webhook fire --service formstack'`));
	} catch {
		// Body wasn't JSON
	}
}

/**
 * Mautic webhook secret capture.
 *
 * When n8n registers a Mautic webhook, it generates a random 64-char hex
 * secret via `randomBytes(32).toString('hex')` and sends it in the POST body
 * as `secret`. n8n stores this in workflow static data and uses it to verify
 * the HMAC-SHA256 (base64) signature in the `Webhook-Signature` header.
 *
 * Matches on path rather than hostname since Mautic uses a user-provided URL.
 *
 * The secret is saved to ~/.n8n-node-mocker/mautic-secret.txt
 *
 * @see https://devdocs.mautic.org/en/5.x/webhooks/getting_started.html
 */
function mauticCaptureSecret(ctx: ServiceHookContext): void {
	try {
		const body = JSON.parse(ctx.bodyStr!) as { secret?: string };
		const secret = body.secret;
		if (!secret || typeof secret !== 'string') return;

		const dir = expandHome(ctx.config.caDir);
		mkdirSync(dir, { recursive: true });
		const filePath = join(dir, 'mautic-secret.txt');
		writeFileSync(filePath, secret);

		console.log(chalk.magenta(`MAUTIC: captured webhook secret -> ${filePath}`));
		console.log(chalk.magenta(`MAUTIC: will be auto-detected by 'webhook fire --service mautic'`));
	} catch {
		// Body wasn't JSON
	}
}

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
