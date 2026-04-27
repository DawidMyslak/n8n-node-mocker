import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

import type { WebhookSigner, SignResult } from './index.js';

/**
 * Netlify uses JSON Web Signatures (JWS) for webhook payload verification.
 * The X-Webhook-Signature header contains a JWT signed with HS256.
 * The JWT payload includes:
 *   - iss: "netlify"
 *   - sha256: hex digest of the payload body (plain SHA-256, not HMAC)
 *
 * The JWT itself is signed with the JWS secret token using HS256.
 *
 * @see https://docs.netlify.com/site-deploys/notifications/#payload-signature
 */
export const netlifySigner: WebhookSigner = {
	service: 'netlify',
	description: 'JWT (HS256) in X-Webhook-Signature header, payload contains sha256 of body',
	signatureAlgorithm: 'JWT-HS256',
	signatureHeader: 'x-webhook-signature',

	sign(payload: Buffer, secret: string): SignResult {
		const sha256 = createHash('sha256').update(payload).digest('hex');

		const token = jwt.sign(
			{ iss: 'netlify', sha256 },
			secret,
			{ algorithm: 'HS256' },
		);

		return {
			headers: {
				'x-webhook-signature': token,
				'content-type': 'application/json',
			},
		};
	},
};
