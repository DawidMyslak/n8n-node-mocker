import { existsSync } from 'node:fs';

import chalk from 'chalk';
import { Command } from 'commander';

import { expandHome, loadConfig } from '../config.js';
import { type ProxyMode, MitmProxy } from '../proxy/mitm-proxy.js';

export const startCommand = new Command('start')
	.description('Start the MITM proxy in record or mock mode')
	.requiredOption('-m, --mode <mode>', 'operating mode: record or mock', 'mock')
	.option('-p, --port <port>', 'port to listen on')
	.option('-c, --config <path>', 'path to config.yaml')
	.action(async (opts: { mode: string; port?: string; config?: string }) => {
		const mode = opts.mode as ProxyMode;
		if (mode !== 'record' && mode !== 'mock') {
			console.error(chalk.red(`Invalid mode "${mode}". Use "record" or "mock".`));
			process.exit(1);
		}

		const config = loadConfig(opts.config);
		if (opts.port) {
			config.port = parseInt(opts.port, 10);
		}

		const caDir = expandHome(config.caDir);
		if (!existsSync(`${caDir}/ca.pem`) || !existsSync(`${caDir}/ca-key.pem`)) {
			console.error(chalk.red('CA certificate not found. Run "n8n-node-mocker init" first.'));
			process.exit(1);
		}

		const proxy = new MitmProxy(mode, config);
		proxy.start();
	});
