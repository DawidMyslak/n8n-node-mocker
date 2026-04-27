import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult, SignMeta } from './index.js';

export const figmaSigner: WebhookSigner = {
	service: 'figma',
	description: 'HMAC-SHA256, hex digest, x-figma-signature header',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'x-figma-signature',

	sign(payload: Buffer, secret: string, meta?: SignMeta): SignResult {
		const timestamp = meta?.timestamp ?? Math.floor(Date.now() / 1000);
		const hmac = createHmac('sha256', secret);
		hmac.update(`${timestamp}.${payload.toString('utf-8')}`);
		const signature = hmac.digest('hex');

		return {
			headers: {
				'x-figma-signature': `t=${timestamp},v1=${signature}`,
				'content-type': 'application/json',
			},
		};
	},
};
