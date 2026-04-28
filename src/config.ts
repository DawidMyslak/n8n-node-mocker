import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import yaml from 'js-yaml';

export interface ServiceConfig {
	signingSecret: string;
}

export type FallbackMode = 'auto' | 'error';

export interface Config {
	port: number;
	fixturesDir: string;
	caDir: string;
	fallbackMode: FallbackMode;
	services: Record<string, ServiceConfig>;
}

const DEFAULT_CONFIG: Config = {
	port: 9090,
	fixturesDir: './fixtures',
	caDir: '~/.n8n-node-mocker',
	fallbackMode: 'auto',
	services: {
		linear: { signingSecret: 'test' },
		typeform: { signingSecret: 'test' },
		figma: { signingSecret: 'test' },
		gitlab: { signingSecret: 'test' },
		trello: { signingSecret: 'test' },
		twilio: { signingSecret: 'test' },
		asana: { signingSecret: 'test' },
		netlify: { signingSecret: 'test' },
		acuityscheduling: { signingSecret: 'test' },
		awssns: { signingSecret: 'test' },
		box: { signingSecret: 'test' },
		cal: { signingSecret: 'test' },
		calendly: { signingSecret: 'test' },
		customerio: { signingSecret: 'test' },
		formstack: { signingSecret: 'test' },
		mailerlite: { signingSecret: 'test' },
		mautic: { signingSecret: 'test' },
		microsoftteams: { signingSecret: 'test' },
		onfleet: { signingSecret: 'test' },
		taiga: { signingSecret: 'test' },
	},
};

export function expandHome(p: string): string {
	if (p.startsWith('~/')) {
		return resolve(process.env.HOME ?? '/tmp', p.slice(2));
	}
	return resolve(p);
}

export function loadConfig(configPath?: string): Config {
	const filePath = configPath ?? 'config.yaml';

	if (existsSync(filePath)) {
		const raw = readFileSync(filePath, 'utf-8');
		const parsed = (yaml.load(raw) as Partial<Config>) ?? {};
		return {
			...DEFAULT_CONFIG,
			...parsed,
			services: { ...DEFAULT_CONFIG.services, ...parsed?.services },
		};
	}

	return DEFAULT_CONFIG;
}
