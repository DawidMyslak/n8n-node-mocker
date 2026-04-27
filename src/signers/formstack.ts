import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

/**
 * Formstack uses HMAC-SHA256, hex-encoded, in the X-FS-Signature header.
 * The header value format is: "sha256=<hex_digest>"
 * The receiver splits on '=' to get the method and signature,
 * then computes hash_hmac(method, body, key).
 *
 * @see https://developers.formstack.com/reference/webhook
 */
export const formstackSigner: WebhookSigner = {
	service: 'formstack',
	description: 'HMAC-SHA256, hex with sha256= prefix, X-FS-Signature header',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'x-fs-signature',

	sign(payload: Buffer, secret: string): SignResult {
		const hmac = createHmac('sha256', secret);
		hmac.update(payload);
		const signature = hmac.digest('hex');

		return {
			headers: {
				'x-fs-signature': `sha256=${signature}`,
				'content-type': 'application/json',
			},
		};
	},
};
