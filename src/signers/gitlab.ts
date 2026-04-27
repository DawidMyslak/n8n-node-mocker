import type { WebhookSigner, SignResult } from './index.js';

/**
 * GitLab uses a simple token match, not HMAC. The secret token is sent
 * verbatim in the `X-Gitlab-Token` header for the receiver to compare.
 *
 * @see https://docs.gitlab.com/ee/user/project/integrations/webhooks.html
 */
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
