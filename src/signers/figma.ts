import type { WebhookSigner, SignResult } from './index.js';

/**
 * Figma uses passcode-based verification, NOT HMAC signatures.
 * When creating a webhook, you provide a `passcode` field.
 * Figma sends this passcode back in each webhook event payload.
 * The receiver compares the passcode in the event with the one
 * it originally provided to verify authenticity.
 *
 * @see https://developers.figma.com/docs/rest-api/webhooks-security/
 */
export const figmaSigner: WebhookSigner = {
	service: 'figma',
	description: 'Passcode verification -- Figma includes the passcode in each event payload',
	signatureAlgorithm: 'passcode',
	signatureHeader: 'n/a (passcode in body)',

	sign(_payload: Buffer, secret: string): SignResult {
		return {
			headers: {
				'content-type': 'application/json',
			},
			bodyPatch: {
				passcode: secret,
			},
		};
	},
};
