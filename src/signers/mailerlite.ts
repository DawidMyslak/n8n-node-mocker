import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

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
