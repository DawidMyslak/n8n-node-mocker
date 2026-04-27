import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

/**
 * MailerLite signs webhooks using HMAC-SHA256 of the JSON payload.
 * New API: hex-encoded in `Signature` header, secret is webhook's secret.
 * Classic API: base64-encoded in `X-MailerLite-Signature`, secret is API key.
 *
 * @see https://developers.mailerlite.com/docs/webhooks
 * @see https://developers-classic.mailerlite.com/docs/webhooks
 */
export const mailerLiteSigner: WebhookSigner = {
	service: 'mailerlite',
	description: 'HMAC-SHA256, hex, signature header',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'signature',

	sign(payload: Buffer, secret: string): SignResult {
		const hmac = createHmac('sha256', secret);
		hmac.update(payload);
		const signature = hmac.digest('hex');

		return {
			headers: {
				signature,
				'content-type': 'application/json',
			},
		};
	},
};
