import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface Fixture {
	request: {
		method: string;
		host: string;
		path: string;
		headers: Record<string, string>;
		body?: unknown;
	};
	response: {
		statusCode: number;
		headers: Record<string, string>;
		body: unknown;
	};
	operationName?: string;
	recordedAt: string;
}

export class FixtureStore {
	constructor(private readonly baseDir: string) {
		if (!existsSync(baseDir)) {
			mkdirSync(baseDir, { recursive: true });
		}
	}

	save(relativePath: string, fixture: Fixture): string {
		const fullPath = resolve(this.baseDir, relativePath);
		const dir = dirname(fullPath);

		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		writeFileSync(fullPath, JSON.stringify(fixture, null, 2));
		return fullPath;
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
	 * Falls back to a _fallback.json if no exact match is found.
	 */
	findFixture(
		host: string,
		path: string,
		method: string,
		operationName: string | null,
	): Fixture | null {
		const safePath = path.replace(/^\//, '').replace(/\//g, '_') || 'root';
		const dir = join(this.baseDir, host, safePath);

		if (!existsSync(dir)) {
			return null;
		}

		if (operationName) {
			const fixture = this.load(join(host, safePath, `${operationName}.json`));
			if (fixture) return fixture;
		}

		const methodFixture = this.load(join(host, safePath, `${method}.json`));
		if (methodFixture) return methodFixture;

		const fallback = this.load(join(host, safePath, '_fallback.json'));
		return fallback;
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
