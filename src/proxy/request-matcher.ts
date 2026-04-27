import { extractGraphQLOperation } from './graphql-parser.js';

export interface RequestKey {
	host: string;
	method: string;
	path: string;
	operationName: string | null;
}

/**
 * Builds a unique key for a request, used for fixture matching.
 * For GraphQL requests, the operation name is included.
 */
export function buildRequestKey(
	host: string,
	method: string,
	path: string,
	body?: string | Record<string, unknown>,
): RequestKey {
	let operationName: string | null = null;

	if (method === 'POST' && body) {
		operationName = extractGraphQLOperation(body);
	}

	return { host, method, path, operationName };
}

/**
 * Converts a request key to a filesystem-safe fixture path.
 * Example: api.linear.app / POST /graphql [IssueCreate] -> api.linear.app/graphql/IssueCreate.json
 */
export function requestKeyToFixturePath(key: RequestKey): string {
	const safePath = key.path.replace(/^\//, '').replace(/\//g, '_') || 'root';

	if (key.operationName) {
		return `${key.host}/${safePath}/${key.operationName}.json`;
	}

	return `${key.host}/${safePath}/${key.method}.json`;
}
