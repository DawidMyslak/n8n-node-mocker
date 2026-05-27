import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { stripeSigner } from './stripe.js';

describe('stripeSigner', () => {
	it('produces a valid HMAC-SHA256 hex signature in t=...,v1=... format', () => {
		const secret = 'test-secret';
		const payload = Buffer.from(JSON.stringify({ type: 'invoice.paid' }));
		const timestamp = 1700000000;

		const result = stripeSigner.sign(payload, secret, { timestamp });

		const expectedData = `${timestamp}.${payload.toString('utf-8')}`;
		const expectedSig = createHmac('sha256', secret).update(expectedData).digest('hex');

		expect(result.headers['stripe-signature']).toBe(`t=${timestamp},v1=${expectedSig}`);
		expect(result.headers['content-type']).toBe('application/json');
	});

	it('uses current time when no timestamp is provided', () => {
		const secret = 'test';
		const payload = Buffer.from('{}');

		const result = stripeSigner.sign(payload, secret);
		const header = result.headers['stripe-signature'];

		expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
	});

	it('converts millisecond timestamps to Unix seconds', () => {
		const secret = 'test-secret';
		const payload = Buffer.from(JSON.stringify({ type: 'invoice.paid' }));
		const timestamp = 1700000000123;
		const expectedTimestamp = 1700000000;

		const result = stripeSigner.sign(payload, secret, { timestamp });

		const expectedData = `${expectedTimestamp}.${payload.toString('utf-8')}`;
		const expectedSig = createHmac('sha256', secret).update(expectedData).digest('hex');

		expect(result.headers['stripe-signature']).toBe(
			`t=${expectedTimestamp},v1=${expectedSig}`,
		);
	});
});
