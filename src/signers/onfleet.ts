import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

export const onfleetSigner: WebhookSigner = {
	service: 'onfleet',
	description: 'HMAC-SHA512, hex, X-Onfleet-Signature header',
	signatureAlgorithm: 'HMAC-SHA512',
	signatureHeader: 'x-onfleet-signature',

	sign(payload: Buffer, secret: string): SignResult {
		const hmac = createHmac('sha512', secret);
		hmac.update(payload);
		const signature = hmac.digest('hex');

		return {
			headers: {
				'x-onfleet-signature': signature,
				'content-type': 'application/json',
			},
		};
	},
};
