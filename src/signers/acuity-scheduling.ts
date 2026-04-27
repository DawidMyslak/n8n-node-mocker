import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

export const acuitySchedulingSigner: WebhookSigner = {
	service: 'acuityscheduling',
	description: 'HMAC-SHA256, base64, Acuity-Webhook-Signature header',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'acuity-webhook-signature',

	sign(payload: Buffer, secret: string): SignResult {
		const hmac = createHmac('sha256', secret);
		hmac.update(payload);
		const signature = hmac.digest('base64');

		return {
			headers: {
				'acuity-webhook-signature': signature,
				'content-type': 'application/json',
			},
		};
	},
};
