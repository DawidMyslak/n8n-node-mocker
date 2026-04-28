import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface Fixture {
	response: {
		statusCode: number;
		headers: Record<string, string>;
		body: unknown;
	};
}

export class FixtureStore {
	constructor(private readonly baseDir: string) {
		if (!existsSync(baseDir)) {
			mkdirSync(baseDir, { recursive: true });
		}
	}

	load(relativePath: string): Fixture | null {
		const fullPath = resolve(this.baseDir, relativePath);

		if (!existsSync(fullPath)) {
			return null;
		}

		const raw = readFileSync(fullPath, 'utf-8');
		return JSON.parse(raw) as Fixture;
	}

	/**
	 * Searches for a fixture matching the given host, path, and optional operation name.
	 *
	 * Lookup order for GET /api/v1/appointments/12345:
	 *   1. acuityscheduling.com/api_v1_appointments_12345/GET.json  (exact)
	 *   2. acuityscheduling.com/api_v1_appointments/GET.json        (parent path)
	 *   3. acuityscheduling.com/api_v1/GET.json                     (grandparent)
	 *   4. acuityscheduling.com/_fallback.json                      (host-level)
	 *
	 * This lets a single fixture like api_v1_appointments/GET.json match any
	 * resource ID under that path.
	 */
	findFixture(
		host: string,
		path: string,
		method: string,
		operationName: string | null,
	): Fixture | null {
		const safePath = path.replace(/^\//, '').replace(/\//g, '_') || 'root';

		const result = this.tryFixtureAt(host, safePath, method, operationName);
		if (result) return result;

		let prefix = safePath;
		while (prefix.includes('_')) {
			prefix = prefix.substring(0, prefix.lastIndexOf('_'));
			const result = this.tryFixtureAt(host, prefix, method, operationName);
			if (result) return result;
		}

		return this.load(join(host, '_fallback.json'));
	}

	private tryFixtureAt(
		host: string,
		safePath: string,
		method: string,
		operationName: string | null,
	): Fixture | null {
		const dir = join(this.baseDir, host, safePath);
		if (!existsSync(dir)) return null;

		if (operationName) {
			const fixture = this.load(join(host, safePath, `${operationName}.json`));
			if (fixture) return fixture;
		}

		const methodFixture = this.load(join(host, safePath, `${method}.json`));
		if (methodFixture) return methodFixture;

		return this.load(join(host, safePath, '_fallback.json'));
	}

	listFixtures(): string[] {
		return this.walkDir(this.baseDir, []);
	}

	private walkDir(dir: string, files: string[]): string[] {
		if (!existsSync(dir)) return files;

		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				this.walkDir(join(dir, entry.name), files);
			} else if (entry.name.endsWith('.json')) {
				files.push(join(dir, entry.name).replace(this.baseDir + '/', ''));
			}
		}

		return files;
	}
}
