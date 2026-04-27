import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult, SignMeta } from './index.js';

/**
 * Customer.io uses HMAC-SHA256, hex-encoded.
 * The signing data format is: "v0:<timestamp>:<raw body>"
 * Headers sent:
 *   - X-CIO-Signature: the hex HMAC digest
 *   - X-CIO-Timestamp: Unix timestamp (seconds)
 *
 * @see https://docs.customer.io/messaging/webhooks-action/
 */
export const customerIoSigner: WebhookSigner = {
	service: 'customerio',
	description: 'HMAC-SHA256, hex, X-CIO-Signature header, signs v0:timestamp:body',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'x-cio-signature',

	sign(payload: Buffer, secret: string, meta?: SignMeta): SignResult {
		const timestamp = meta?.timestamp
			? Math.floor(meta.timestamp / 1000)
			: Math.floor(Date.now() / 1000);

		const hmac = createHmac('sha256', secret);
		hmac.update(`v0:${timestamp}:`);
		hmac.update(payload);
		const signature = hmac.digest('hex');

		return {
			headers: {
				'x-cio-signature': signature,
				'x-cio-timestamp': String(timestamp),
				'content-type': 'application/json',
			},
		};
	},
};
