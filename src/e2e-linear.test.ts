import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { linearSigner } from './signers/linear.js';

/**
 * This test simulates the exact verification logic that n8n's LinearTrigger uses.
 * It proves that the signer produces output that n8n will accept.
 *
 * Reference: packages/nodes-base/nodes/Linear/LinearTriggerHelpers.ts
 */
function verifyLinearSignature(
	rawBody: Buffer,
	signingSecret: string,
	signatureHeader: string,
	webhookTimestamp: number,
): boolean {
	// n8n's verification: HMAC-SHA256 of rawBody with signingSecret, hex digest
	const hmac = createHmac('sha256', signingSecret);
	hmac.update(rawBody);
	const expectedSignature = hmac.digest('hex');

	// Timing-safe comparison
	const expectedBuf = Buffer.from(expectedSignature);
	const actualBuf = Buffer.from(signatureHeader);

	if (expectedBuf.length !== actualBuf.length) return false;
	if (!timingSafeEqual(expectedBuf, actualBuf)) return false;

	// Timestamp freshness check (within 60 seconds for Linear)
	const timestampSec = webhookTimestamp > 1e10
		? Math.floor(webhookTimestamp / 1000)
		: webhookTimestamp;
	const currentTimeSec = Math.floor(Date.now() / 1000);
	const age = Math.abs(currentTimeSec - timestampSec);

	return age <= 60;
}

describe('Linear end-to-end signing verification', () => {
	const secret = 'test-secret-linear';

	it('signer output passes n8n verification for issue.created template', () => {
		const templatePath = resolve(import.meta.dirname, 'templates/linear/issue.created.json');
		const templatePayload = JSON.parse(readFileSync(templatePath, 'utf-8'));

		const now = Date.now();
		const signResult = linearSigner.sign(Buffer.from('{}'), secret, { timestamp: now });

		// Apply body patch (adds webhookTimestamp)
		Object.assign(templatePayload, signResult.bodyPatch);
		const finalPayload = JSON.stringify(templatePayload);
		const finalBuffer = Buffer.from(finalPayload);

		// Re-sign with final payload
		const finalResult = linearSigner.sign(finalBuffer, secret, { timestamp: now });

		// Verify with n8n's algorithm
		const isValid = verifyLinearSignature(
			finalBuffer,
			secret,
			finalResult.headers['linear-signature'],
			templatePayload.webhookTimestamp,
		);

		expect(isValid).toBe(true);
	});

	it('verification fails with wrong secret', () => {
		const payload = Buffer.from(JSON.stringify({ action: 'create', webhookTimestamp: Date.now() }));
		const result = linearSigner.sign(payload, secret);

		const isValid = verifyLinearSignature(
			payload,
			'wrong-secret',
			result.headers['linear-signature'],
			Date.now(),
		);

		expect(isValid).toBe(false);
	});

	it('verification fails with tampered payload', () => {
		const payload = Buffer.from(JSON.stringify({ action: 'create', webhookTimestamp: Date.now() }));
		const result = linearSigner.sign(payload, secret);

		const tampered = Buffer.from(JSON.stringify({ action: 'delete', webhookTimestamp: Date.now() }));

		const isValid = verifyLinearSignature(
			tampered,
			secret,
			result.headers['linear-signature'],
			Date.now(),
		);

		expect(isValid).toBe(false);
	});
});
