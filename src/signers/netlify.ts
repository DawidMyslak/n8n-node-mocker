import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

export const netlifySigner: WebhookSigner = {
	service: 'netlify',
	description: 'HMAC-SHA256, base64, x-webhook-signature header',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'x-webhook-signature',

	sign(payload: Buffer, secret: string): SignResult {
		const hmac = createHmac('sha256', secret);
		hmac.update(payload);
		const signature = hmac.digest('base64');

		return {
			headers: {
				'x-webhook-signature': signature,
				'content-type': 'application/json',
			},
		};
	},
};
