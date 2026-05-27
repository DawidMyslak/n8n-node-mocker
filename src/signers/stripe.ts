import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult, SignMeta } from './index.js';

/**
 * Stripe signs webhooks using HMAC-SHA256 of `timestamp.body`, hex-encoded.
 * The header format is `Stripe-Signature: t=<unix_ts>,v1=<sig>`.
 * The timestamp is in seconds (Unix epoch).
 *
 * @see https://docs.stripe.com/webhooks#verify-manually
 */
export const stripeSigner: WebhookSigner = {
	service: 'stripe',
	description: 'HMAC-SHA256, hex, Stripe-Signature header (t=timestamp,v1=sig)',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'stripe-signature',

	sign(payload: Buffer, secret: string, meta?: SignMeta): SignResult {
		const timestamp = meta?.timestamp ?? Math.floor(Date.now() / 1000);
		const data = `${timestamp}.${payload.toString('utf-8')}`;
		const hmac = createHmac('sha256', secret);
		hmac.update(data);
		const signature = hmac.digest('hex');

		return {
			headers: {
				'stripe-signature': `t=${timestamp},v1=${signature}`,
				'content-type': 'application/json',
			},
		};
	},
};
