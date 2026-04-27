import { describe, expect, it } from 'vitest';

import { buildRequestKey, requestKeyToFixturePath } from './request-matcher.js';

describe('buildRequestKey', () => {
	it('extracts GraphQL operation for POST requests', () => {
		const body = JSON.stringify({
			query: 'mutation IssueCreate { issueCreate { success } }',
		});

		const key = buildRequestKey('api.linear.app', 'POST', '/graphql', body);
		expect(key.operationName).toBe('IssueCreate');
		expect(key.host).toBe('api.linear.app');
	});

	it('returns null operation for GET requests', () => {
		const key = buildRequestKey('api.github.com', 'GET', '/repos/foo/bar');
		expect(key.operationName).toBeNull();
	});
});

describe('requestKeyToFixturePath', () => {
	it('builds path with operation name for GraphQL', () => {
		const path = requestKeyToFixturePath({
			host: 'api.linear.app',
			method: 'POST',
			path: '/graphql',
			operationName: 'IssueCreate',
		});
		expect(path).toBe('api.linear.app/graphql/IssueCreate.json');
	});

	it('builds path with method for REST', () => {
		const path = requestKeyToFixturePath({
			host: 'api.github.com',
			method: 'GET',
			path: '/repos/foo/bar',
			operationName: null,
		});
		expect(path).toBe('api.github.com/repos_foo_bar/GET.json');
	});
});
