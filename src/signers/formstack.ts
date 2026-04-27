import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

export const formstackSigner: WebhookSigner = {
	service: 'formstack',
	description: 'HMAC-SHA256, base64, X-FS-Signature header',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'x-fs-signature',

	sign(payload: Buffer, secret: string): SignResult {
		const hmac = createHmac('sha256', secret);
		hmac.update(payload);
		const signature = hmac.digest('base64');

		return {
			headers: {
				'x-fs-signature': signature,
				'content-type': 'application/json',
			},
		};
	},
};
