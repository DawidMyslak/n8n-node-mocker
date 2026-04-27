import type { WebhookSigner, SignResult } from './index.js';

export const gitlabSigner: WebhookSigner = {
	service: 'gitlab',
	description: 'Secret token in X-Gitlab-Token header (not HMAC)',
	signatureAlgorithm: 'token',
	signatureHeader: 'x-gitlab-token',

	sign(_payload: Buffer, secret: string): SignResult {
		return {
			headers: {
				'x-gitlab-token': secret,
				'content-type': 'application/json',
			},
		};
	},
};
