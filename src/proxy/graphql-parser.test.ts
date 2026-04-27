import { describe, expect, it } from 'vitest';

import { extractGraphQLOperation } from './graphql-parser.js';

describe('extractGraphQLOperation', () => {
	it('extracts operation name from mutation query string', () => {
		const body = {
			query: `mutation IssueCreate ($title: String!) { issueCreate(input: { title: $title }) { success } }`,
			variables: { title: 'Test' },
		};

		expect(extractGraphQLOperation(body)).toBe('IssueCreate');
	});

	it('extracts operation name from query string', () => {
		const body = {
			query: `query Teams { teams { nodes { id name } } }`,
		};

		expect(extractGraphQLOperation(body)).toBe('Teams');
	});

	it('uses explicit operationName field when present', () => {
		const body = {
			query: `query { viewer { id } }`,
			operationName: 'GetViewer',
		};

		expect(extractGraphQLOperation(body)).toBe('GetViewer');
	});

	it('returns null for queries without an operation name', () => {
		const body = {
			query: `{ viewer { id } }`,
		};

		expect(extractGraphQLOperation(body)).toBeNull();
	});

	it('handles string bodies', () => {
		const body = JSON.stringify({
			query: `mutation webhookCreate($url: String!) { webhookCreate(input: { url: $url }) { success } }`,
		});

		expect(extractGraphQLOperation(body)).toBe('webhookCreate');
	});

	it('returns null for invalid input', () => {
		expect(extractGraphQLOperation('not json')).toBeNull();
	});
});
