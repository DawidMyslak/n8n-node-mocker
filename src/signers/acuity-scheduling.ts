import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

/**
 * Acuity Scheduling uses HMAC-SHA256, base64-encoded,
 * in the `X-Acuity-Signature` header.
 * The secret is the account's API key.
 *
 * @see https://developers.acuityscheduling.com/docs/webhooks#verifying-webhook-requests
 */
export const acuitySchedulingSigner: WebhookSigner = {
	service: 'acuityscheduling',
	description: 'HMAC-SHA256, base64, X-Acuity-Signature header',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'x-acuity-signature',

	sign(payload: Buffer, secret: string): SignResult {
		const hmac = createHmac('sha256', secret);
		hmac.update(payload);
		const signature = hmac.digest('base64');

		return {
			headers: {
				'x-acuity-signature': signature,
				'content-type': 'application/json',
			},
		};
	},
};
