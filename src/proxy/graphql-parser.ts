/**
 * Extracts the GraphQL operation name from a request body.
 * Works with both named operations in the query string and
 * explicit operationName fields.
 */
export function extractGraphQLOperation(body: string | Record<string, unknown>): string | null {
	try {
		const parsed = typeof body === 'string' ? JSON.parse(body) : body;

		if (parsed.operationName && typeof parsed.operationName === 'string') {
			return parsed.operationName;
		}

		if (typeof parsed.query === 'string') {
			const match = parsed.query.match(
				/(?:query|mutation|subscription)\s+(\w+)/,
			);
			if (match) {
				return match[1];
			}
		}

		return null;
	} catch {
		return null;
	}
}
