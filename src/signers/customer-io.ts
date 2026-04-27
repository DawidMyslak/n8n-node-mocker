import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

export const customerIoSigner: WebhookSigner = {
	service: 'customerio',
	description: 'HMAC-SHA256, hex, X-CIO-Signature header',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'x-cio-signature',

	sign(payload: Buffer, secret: string): SignResult {
		const hmac = createHmac('sha256', secret);
		hmac.update(payload);
		const signature = hmac.digest('hex');

		return {
			headers: {
				'x-cio-signature': signature,
				'content-type': 'application/json',
			},
		};
	},
};
