import { existsSync, mkdirSync } from 'node:fs';

import chalk from 'chalk';
import { Command } from 'commander';

import { expandHome, loadConfig } from '../config.js';
import { generateCA } from '../proxy/ca.js';

export const initCommand = new Command('init')
	.description('Generate CA certificate for HTTPS interception')
	.option('-c, --config <path>', 'path to config.yaml')
	.action(async (opts: { config?: string }) => {
		const config = loadConfig(opts.config);
		const caDir = expandHome(config.caDir);

		if (!existsSync(caDir)) {
			mkdirSync(caDir, { recursive: true });
		}

		const certPath = `${caDir}/ca.pem`;
		const keyPath = `${caDir}/ca-key.pem`;

		if (existsSync(certPath) && existsSync(keyPath)) {
			console.log(chalk.yellow('CA certificate already exists at:'));
			console.log(`  ${certPath}`);
			console.log(chalk.dim('Delete the files and re-run to regenerate.'));
			return;
		}

		generateCA(certPath, keyPath);

		console.log(chalk.green('CA certificate generated:'));
		console.log(`  Certificate: ${certPath}`);
		console.log(`  Private key: ${keyPath}`);
		console.log();
		console.log(chalk.cyan('To use with n8n, start it with:'));
		console.log(
			chalk.dim(
				`  NODE_EXTRA_CA_CERTS=${certPath} HTTPS_PROXY=http://localhost:${config.port} pnpm dev`,
			),
		);
	});
