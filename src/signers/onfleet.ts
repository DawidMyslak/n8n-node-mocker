import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

/**
 * Onfleet uses HMAC-SHA512, hex-encoded, in the X-Onfleet-Signature header.
 *
 * CRITICAL: The webhook secret from Onfleet is a hexadecimal string.
 * It must be decoded from hex to raw bytes before being used as the HMAC key.
 * i.e., Buffer.from(secret, 'hex') rather than using the string directly.
 *
 * @see https://docs.onfleet.com/reference/secrets
 */
export const onfleetSigner: WebhookSigner = {
	service: 'onfleet',
	description: 'HMAC-SHA512, hex, X-Onfleet-Signature header (secret is hex-encoded key)',
	signatureAlgorithm: 'HMAC-SHA512',
	signatureHeader: 'x-onfleet-signature',

	sign(payload: Buffer, secret: string): SignResult {
		const secretKey = Buffer.from(secret, 'hex');
		const hmac = createHmac('sha512', secretKey);
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
