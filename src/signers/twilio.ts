import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult, SignMeta } from './index.js';

/**
 * Twilio signs webhooks using HMAC-SHA1, base64-encoded.
 * The signed data is the full webhook URL + sorted POST params (key+value pairs).
 * The secret is the account's auth token.
 *
 * @see https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export const twilioSigner: WebhookSigner = {
	service: 'twilio',
	description: 'HMAC-SHA1, base64, X-Twilio-Signature header (URL + sorted params)',
	signatureAlgorithm: 'HMAC-SHA1',
	signatureHeader: 'x-twilio-signature',

	sign(payload: Buffer, secret: string, meta?: SignMeta): SignResult {
		const url = meta?.webhookUrl ?? '';
		let dataToSign = url;

		try {
			const params = JSON.parse(payload.toString('utf-8'));
			if (typeof params === 'object' && params !== null) {
				const sortedKeys = Object.keys(params).sort();
				for (const key of sortedKeys) {
					dataToSign += key + params[key];
				}
			}
		} catch {
			// If body isn't JSON, just use the URL
		}

		const hmac = createHmac('sha1', secret);
		hmac.update(dataToSign);
		const signature = hmac.digest('base64');

		return {
			headers: {
				'x-twilio-signature': signature,
				'content-type': 'application/json',
			},
		};
	},
};
