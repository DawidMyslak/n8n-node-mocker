const SENSITIVE_HEADER_PATTERNS = [
	/^authorization$/i,
	/^x-api-key$/i,
	/^cookie$/i,
	/^set-cookie$/i,
];

/**
 * Strips sensitive headers from recorded fixtures.
 */
export function sanitizeHeaders(
	headers: Record<string, string>,
): Record<string, string> {
	const sanitized: Record<string, string> = {};

	for (const [key, value] of Object.entries(headers)) {
		if (SENSITIVE_HEADER_PATTERNS.some((p) => p.test(key))) {
			sanitized[key] = '[REDACTED]';
		} else {
			sanitized[key] = value;
		}
	}

	return sanitized;
}
