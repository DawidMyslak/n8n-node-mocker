import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult, SignMeta } from './index.js';

/**
 * Trello signs webhooks using HMAC-SHA1, base64-encoded.
 * The signed data is the concatenation of the JSON body + the callbackURL.
 * The secret is the application's OAuth secret.
 *
 * @see https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/#webhook-signatures
 */
export const trelloSigner: WebhookSigner = {
	service: 'trello',
	description: 'HMAC-SHA1, base64, x-trello-webhook header (body + callbackURL)',
	signatureAlgorithm: 'HMAC-SHA1',
	signatureHeader: 'x-trello-webhook',

	sign(payload: Buffer, secret: string, meta?: SignMeta): SignResult {
		const callbackUrl = meta?.webhookUrl ?? '';
		const hmac = createHmac('sha1', secret);
		hmac.update(payload.toString('utf-8') + callbackUrl);
		const signature = hmac.digest('base64');

		return {
			headers: {
				'x-trello-webhook': signature,
				'content-type': 'application/json',
			},
		};
	},
};
