import { createHmac } from 'node:crypto';

import type { WebhookSigner, SignResult } from './index.js';

/**
 * Microsoft Teams / Graph uses HMAC-SHA256 for change notification validation.
 * The clientState is set during subscription and sent back in each notification.
 * Actual Graph change notifications can also use encrypted content;
 * this signer covers the basic clientState verification path.
 */
export const microsoftTeamsSigner: WebhookSigner = {
	service: 'microsoftteams',
	description: 'clientState verification in body (Microsoft Graph change notifications)',
	signatureAlgorithm: 'HMAC-SHA256',
	signatureHeader: 'content-type',

	sign(payload: Buffer, secret: string): SignResult {
		return {
			headers: {
				'content-type': 'application/json',
			},
			bodyPatch: {
				value: [{
					clientState: secret,
				}],
			},
		};
	},
};
