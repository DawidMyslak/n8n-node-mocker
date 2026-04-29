import { createHash, createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult, SignMeta } from './index.js';

/**
 * Twilio Event Streams webhook signing.
 *
 * For JSON webhooks (used by n8n's TwilioTrigger), Twilio:
 * 1. Computes SHA-256 of the raw JSON body
 * 2. Appends it as `?bodySHA256=<hex>` to the sink URL
 * 3. HMAC-SHA1 of the full URL (with bodySHA256 param) using the auth token
 * 4. Sends the base64 result in the `X-Twilio-Signature` header
 *
 * The secret is the Twilio account's Auth Token.
 *
 * @see https://www.twilio.com/docs/usage/webhooks/webhooks-security
 * @see https://twilio.com/docs/events/webhook-quickstart
 */
export const twilioSigner: WebhookSigner = {
	service: 'twilio',
	description: 'HMAC-SHA1, base64, bodySHA256 query param + URL signing (Event Streams)',
	signatureAlgorithm: 'HMAC-SHA1',
	signatureHeader: 'x-twilio-signature',

	sign(payload: Buffer, secret: string, meta?: SignMeta): SignResult {
		const url = meta?.webhookUrl ?? '';

		const bodySHA256 = createHash('sha256').update(payload).digest('hex');
		const signedUrl = url.includes('?')
			? `${url}&bodySHA256=${bodySHA256}`
			: `${url}?bodySHA256=${bodySHA256}`;

		const signature = createHmac('sha1', secret).update(signedUrl).digest('base64');

		return {
			headers: {
				'x-twilio-signature': signature,
				'content-type': 'application/json',
			},
			queryParams: {
				bodySHA256,
			},
		};
	},
};
