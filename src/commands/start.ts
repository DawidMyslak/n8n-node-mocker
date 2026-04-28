import { existsSync } from 'node:fs';

import chalk from 'chalk';
import { Command } from 'commander';

import { expandHome, loadConfig } from '../config.js';
import { MitmProxy } from '../proxy/mitm-proxy.js';

export const startCommand = new Command('start')
	.description('Start the mock proxy')
	.option('-p, --port <port>', 'port to listen on')
	.option('-c, --config <path>', 'path to config.yaml')
	.action(async (opts: { port?: string; config?: string }) => {
		const config = loadConfig(opts.config);
		if (opts.port) {
			config.port = parseInt(opts.port, 10);
		}

		const caDir = expandHome(config.caDir);
		if (!existsSync(`${caDir}/ca.pem`) || !existsSync(`${caDir}/ca-key.pem`)) {
			console.error(chalk.red('CA certificate not found. Run "n8n-node-mocker init" first.'));
			process.exit(1);
		}

		const proxy = new MitmProxy(config);
		proxy.start();
	});
