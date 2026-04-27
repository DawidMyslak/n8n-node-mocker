import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult, SignMeta } from './index.js';

/**
 * Calendly signs webhooks using HMAC-SHA256 of `timestamp.body`, hex-encoded.
 * The header format is `Calendly-Webhook-Signature: t=<ts>,v1=<sig>`.
 *
 * @see https://developer.calendly.com/api-docs/4c305798a61d3-webhook-signatures
 */
export const calendlySigner: WebhookSigner = {
	service: 'calendly',
	description: 'HMAC-SHA256, hex, Calendly-Webhook-Signature header (t=timestamp,v1=sig)',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'calendly-webhook-signature',

	sign(payload: Buffer, secret: string, meta?: SignMeta): SignResult {
		const timestamp = meta?.timestamp ?? Math.floor(Date.now() / 1000);
		const data = `${timestamp}.${payload.toString('utf-8')}`;
		const hmac = createHmac('sha256', secret);
		hmac.update(data);
		const signature = hmac.digest('hex');

		return {
			headers: {
				'calendly-webhook-signature': `t=${timestamp},v1=${signature}`,
				'content-type': 'application/json',
			},
		};
	},
};
