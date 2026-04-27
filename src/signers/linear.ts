import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult, SignMeta } from './index.js';

/**
 * Linear signs webhooks using HMAC-SHA256 of the raw request body.
 * The hex-encoded signature is sent in the `Linear-Signature` header.
 * The body includes a `webhookTimestamp` field (UNIX ms) for replay prevention.
 *
 * @see https://linear.app/developers/webhooks
 * @see https://developers.linear.app/docs/sdk/webhooks
 */
export const linearSigner: WebhookSigner = {
	service: 'linear',
	description: 'HMAC-SHA256, hex digest, linear-signature header, webhookTimestamp in body',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'linear-signature',

	sign(payload: Buffer, secret: string, meta?: SignMeta): SignResult {
		const timestamp = meta?.timestamp ?? Date.now();
		const hmac = createHmac('sha256', secret);
		hmac.update(payload);
		const signature = hmac.digest('hex');

		return {
			headers: {
				'linear-signature': signature,
				'content-type': 'application/json',
			},
			bodyPatch: {
				webhookTimestamp: timestamp,
			},
		};
	},
};
