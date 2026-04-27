import type { WebhookSigner, SignResult } from './index.js';

/**
 * AWS SNS uses certificate-based verification (X.509 signature).
 * Full simulation would require a fake signing certificate.
 * This signer provides the required headers/structure so the
 * message format is correct; actual signature verification
 * would need to be bypassed or a test certificate configured.
 */
export const awsSnsSigner: WebhookSigner = {
	service: 'awssns',
	description: 'Certificate-based (X.509) -- placeholder signer, sets required headers',
	signatureAlgorithm: 'RSA-SHA256 (certificate)',
	signatureHeader: 'x-amz-sns-message-type',

	sign(payload: Buffer, _secret: string): SignResult {
		return {
			headers: {
				'x-amz-sns-message-type': 'Notification',
				'x-amz-sns-message-id': `test-${Date.now()}`,
				'content-type': 'text/plain; charset=UTF-8',
			},
		};
	},
};
