import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

export const typeformSigner: WebhookSigner = {
	service: 'typeform',
	description: 'HMAC-SHA256, base64, sha256= prefix, typeform-signature header',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'typeform-signature',

	sign(payload: Buffer, secret: string): SignResult {
		const hmac = createHmac('sha256', secret);
		hmac.update(payload);
		const hash = hmac.digest('base64');

		return {
			headers: {
				'typeform-signature': `sha256=${hash}`,
				'content-type': 'application/json',
			},
		};
	},
};
