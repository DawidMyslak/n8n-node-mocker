import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

/**
 * Cal.com signs webhooks using HMAC-SHA256, hex-encoded,
 * in the `X-Cal-Signature-256` header.
 *
 * @see https://cal.com/docs/core-features/webhooks#verifying-the-authenticity-of-the-received-payload
 */
export const calSigner: WebhookSigner = {
	service: 'cal',
	description: 'HMAC-SHA256, hex, X-Cal-Signature-256 header',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'x-cal-signature-256',

	sign(payload: Buffer, secret: string): SignResult {
		const hmac = createHmac('sha256', secret);
		hmac.update(payload);
		const signature = hmac.digest('hex');

		return {
			headers: {
				'x-cal-signature-256': signature,
				'content-type': 'application/json',
			},
		};
	},
};
