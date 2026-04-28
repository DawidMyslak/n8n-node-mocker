import type { WebhookSigner, SignResult } from './index.js';

/**
 * GitLab uses a simple secret token match (not HMAC). The token is sent
 * verbatim in the `X-Gitlab-Token` header for the receiver to compare.
 *
 * Note: GitLab also supports a newer "signing token" (HMAC-SHA256 via
 * `webhook-signature` header), but n8n uses the legacy secret token approach.
 *
 * @see https://docs.gitlab.com/ee/user/project/integrations/webhooks.html#delivery-headers
 * @see https://docs.gitlab.com/ee/api/project_webhooks.html
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
