import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult, SignMeta } from './index.js';

/**
 * Box uses HMAC-SHA256, base64-encoded, with dual primary/secondary keys.
 * The signing data is: payload bytes + delivery timestamp bytes (appended, not delimited).
 * Box sends:
 *   - BOX-SIGNATURE-PRIMARY / BOX-SIGNATURE-SECONDARY headers
 *   - BOX-DELIVERY-TIMESTAMP header (RFC-3339 timestamp)
 *   - BOX-SIGNATURE-VERSION: 1
 *   - BOX-SIGNATURE-ALGORITHM: HmacSHA256
 *
 * The mock only uses the primary key. The receiver considers the
 * message valid if EITHER primary or secondary matches.
 *
 * @see https://box.dev/guides/webhooks/v2/signatures-v2
 */
export const boxSigner: WebhookSigner = {
	service: 'box',
	description: 'HMAC-SHA256, base64, BOX-SIGNATURE-PRIMARY header, body + timestamp',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'box-signature-primary',

	sign(payload: Buffer, secret: string, meta?: SignMeta): SignResult {
		const timestamp = meta?.timestamp
			? new Date(meta.timestamp).toISOString()
			: new Date().toISOString();

		const hmac = createHmac('sha256', secret);
		hmac.update(payload);
		hmac.update(Buffer.from(timestamp, 'utf-8'));
		const signature = hmac.digest('base64');

		return {
			headers: {
				'box-signature-primary': signature,
				'box-signature-secondary': '',
				'box-delivery-id': `mock-${Date.now()}`,
				'box-delivery-timestamp': timestamp,
				'box-signature-version': '1',
				'box-signature-algorithm': 'HmacSHA256',
				'content-type': 'application/json',
			},
		};
	},
};
