import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { linearSigner } from './linear.js';

describe('linearSigner', () => {
	it('produces a valid HMAC-SHA256 hex signature in the linear-signature header', () => {
		const secret = 'test-secret';
		const payload = Buffer.from(JSON.stringify({ action: 'create', type: 'Issue' }));

		const result = linearSigner.sign(payload, secret, { timestamp: 1700000000000 });

		const expectedHmac = createHmac('sha256', secret).update(payload).digest('hex');
		expect(result.headers['linear-signature']).toBe(expectedHmac);
		expect(result.bodyPatch?.webhookTimestamp).toBe(1700000000000);
	});
});
