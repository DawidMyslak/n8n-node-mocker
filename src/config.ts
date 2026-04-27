import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import yaml from 'js-yaml';

export interface ServiceConfig {
	signingSecret: string;
}

export interface Config {
	port: number;
	fixturesDir: string;
	caDir: string;
	services: Record<string, ServiceConfig>;
}

const DEFAULT_CONFIG: Config = {
	port: 9090,
	fixturesDir: './fixtures',
	caDir: '~/.n8n-node-mocker',
	services: {
		linear: { signingSecret: 'test-secret-linear' },
		typeform: { signingSecret: 'test-secret-typeform' },
		figma: { signingSecret: 'test-secret-figma' },
		gitlab: { signingSecret: 'test-secret-gitlab' },
		trello: { signingSecret: 'test-secret-trello' },
		twilio: { signingSecret: 'test-secret-twilio' },
		asana: { signingSecret: 'test-secret-asana' },
		netlify: { signingSecret: 'test-secret-netlify' },
		acuityscheduling: { signingSecret: 'test-secret-acuity' },
		awssns: { signingSecret: 'test-secret-awssns' },
		box: { signingSecret: 'test-secret-box' },
		cal: { signingSecret: 'test-secret-cal' },
		calendly: { signingSecret: 'test-secret-calendly' },
		customerio: { signingSecret: 'test-secret-customerio' },
		formstack: { signingSecret: 'test-secret-formstack' },
		mailerlite: { signingSecret: 'test-secret-mailerlite' },
		mautic: { signingSecret: 'test-secret-mautic' },
		microsoftteams: { signingSecret: 'test-secret-msteams' },
		onfleet: { signingSecret: 'test-secret-onfleet' },
		taiga: { signingSecret: 'test-secret-taiga' },
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
		const parsed = yaml.load(raw) as Partial<Config>;
		return {
			...DEFAULT_CONFIG,
			...parsed,
			services: { ...DEFAULT_CONFIG.services, ...parsed.services },
		};
	}

	return DEFAULT_CONFIG;
}
