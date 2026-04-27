import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

export const mauticSigner: WebhookSigner = {
	service: 'mautic',
	description: 'HMAC-SHA256, base64, Webhook-Signature header',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'webhook-signature',

	sign(payload: Buffer, secret: string): SignResult {
		const hmac = createHmac('sha256', secret);
		hmac.update(payload);
		const signature = hmac.digest('base64');

		return {
			headers: {
				'webhook-signature': signature,
				'content-type': 'application/json',
			},
		};
	},
};
