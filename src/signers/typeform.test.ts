import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { typeformSigner } from './typeform.js';

describe('typeformSigner', () => {
	it('produces sha256= prefixed base64 signature in typeform-signature header', () => {
		const secret = 'test-secret';
		const payload = Buffer.from(JSON.stringify({ event_type: 'form_response' }));

		const result = typeformSigner.sign(payload, secret);

		const expectedHash = createHmac('sha256', secret).update(payload).digest('base64');
		expect(result.headers['typeform-signature']).toBe(`sha256=${expectedHash}`);
	});
});
