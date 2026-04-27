import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult, SignMeta } from './index.js';

export const boxSigner: WebhookSigner = {
	service: 'box',
	description: 'HMAC-SHA256, base64, box-signature-primary + timestamp header',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'box-signature-primary',

	sign(payload: Buffer, secret: string, meta?: SignMeta): SignResult {
		const timestamp = meta?.timestamp
			? new Date(meta.timestamp).toISOString()
			: new Date().toISOString();
		const data = payload.toString('utf-8') + timestamp;
		const hmac = createHmac('sha256', secret);
		hmac.update(data);
		const signature = hmac.digest('base64');

		return {
			headers: {
				'box-signature-primary': signature,
				'box-delivery-timestamp': timestamp,
				'content-type': 'application/json',
			},
		};
	},
};
