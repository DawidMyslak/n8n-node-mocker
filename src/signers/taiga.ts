import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

export const taigaSigner: WebhookSigner = {
	service: 'taiga',
	description: 'HMAC-SHA1, hex, X-TAIGA-WEBHOOK-SIGNATURE header',
	signatureAlgorithm: 'HMAC-SHA1',
	signatureHeader: 'x-taiga-webhook-signature',

	sign(payload: Buffer, secret: string): SignResult {
		const hmac = createHmac('sha1', secret);
		hmac.update(payload);
		const signature = hmac.digest('hex');

		return {
			headers: {
				'x-taiga-webhook-signature': signature,
				'content-type': 'application/json',
			},
		};
	},
};
