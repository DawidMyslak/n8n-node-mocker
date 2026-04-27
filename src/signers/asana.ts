import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

export const asanaSigner: WebhookSigner = {
	service: 'asana',
	description: 'HMAC-SHA256, hex, x-hook-signature header (+ x-hook-secret for handshake)',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'x-hook-signature',

	sign(payload: Buffer, secret: string): SignResult {
		const hmac = createHmac('sha256', secret);
		hmac.update(payload);
		const signature = hmac.digest('hex');

		return {
			headers: {
				'x-hook-signature': signature,
				'content-type': 'application/json',
			},
		};
	},
};
