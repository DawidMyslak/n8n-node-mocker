import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';

import { expandHome, loadConfig } from '../config.js';
import { getSigner, listSigners } from '../signers/index.js';

export const webhookCommand = new Command('webhook')
	.description('Simulate webhook events to n8n');

webhookCommand
	.command('fire')
	.description('Fire a signed webhook event to an n8n webhook URL')
	.requiredOption('-s, --service <service>', 'service name (e.g. linear, typeform, figma)')
	.requiredOption('-u, --url <url>', 'n8n webhook URL to POST to')
	.option('-e, --event <event>', 'event template name (e.g. issue.created)')
	.option('-p, --payload <json>', 'inline JSON payload')
	.option('-f, --payload-file <path>', 'path to a JSON payload file')
	.option('--webhook-url <webhookUrl>', 'original webhook URL (for Twilio/Trello signing)')
	.option('-c, --config <path>', 'path to config.yaml')
	.action(async (opts: {
		service: string;
		url: string;
		event?: string;
		payload?: string;
		payloadFile?: string;
		webhookUrl?: string;
		config?: string;
	}) => {
		const config = loadConfig(opts.config);
		const signer = getSigner(opts.service);

		if (!signer) {
			console.error(chalk.red(`Unknown service "${opts.service}".`));
			console.error(chalk.dim('Run "n8n-node-mocker webhook list-services" to see available services.'));
			process.exit(1);
		}

		const serviceConfig = config.services[opts.service.toLowerCase()];
		if (!serviceConfig) {
			console.error(chalk.red(`No config found for service "${opts.service}". Add it to config.yaml.`));
			process.exit(1);
		}

		// Auto-detect dynamic secrets captured by the proxy
		const dynamicSecretFiles: Record<string, string> = {
			figma: 'figma-passcode.txt',
			gitlab: 'gitlab-token.txt',
			netlify: 'netlify-secret.txt',
		};
		const secretFile = dynamicSecretFiles[opts.service.toLowerCase()];
		if (secretFile) {
			const secretPath = join(expandHome(config.caDir), secretFile);
			if (existsSync(secretPath)) {
				const captured = readFileSync(secretPath, 'utf-8').trim();
				if (captured) {
					serviceConfig.signingSecret = captured;
					console.log(chalk.dim(`  Using captured ${opts.service} secret from ${secretPath}`));
				}
			}
		}

		let payloadObj: Record<string, unknown>;

		if (opts.payload) {
			payloadObj = JSON.parse(opts.payload);
		} else if (opts.payloadFile) {
			payloadObj = JSON.parse(readFileSync(opts.payloadFile, 'utf-8'));
		} else if (opts.event) {
			const templatePath = resolve(
				import.meta.dirname ?? '.',
				'../templates',
				opts.service.toLowerCase(),
				`${opts.event}.json`,
			);
			// Also check the built dist/templates path
			const altTemplatePath = resolve(
				import.meta.dirname ?? '.',
				'../src/templates',
				opts.service.toLowerCase(),
				`${opts.event}.json`,
			);
			const actualPath = existsSync(templatePath) ? templatePath : altTemplatePath;

			if (!existsSync(actualPath)) {
				console.error(chalk.red(`No template found for ${opts.service}/${opts.event}`));
				console.error(chalk.dim(`Looked in: ${templatePath}`));
				process.exit(1);
			}
			payloadObj = JSON.parse(readFileSync(actualPath, 'utf-8'));
		} else {
			console.error(chalk.red('Provide --event, --payload, or --payload-file'));
			process.exit(1);
		}

		const meta = {
			webhookUrl: opts.webhookUrl ?? opts.url,
			timestamp: Date.now(),
		};

		// Apply body patches before signing (e.g. webhookTimestamp for Linear)
		const signResult = signer.sign(Buffer.from('{}'), serviceConfig.signingSecret, meta);
		if (signResult.bodyPatch) {
			Object.assign(payloadObj, signResult.bodyPatch);
		}

		// Now sign the actual payload
		const payloadBuffer = Buffer.from(JSON.stringify(payloadObj));
		const finalResult = signer.sign(payloadBuffer, serviceConfig.signingSecret, meta);

		// Re-apply body patches to ensure they're in the final payload
		if (finalResult.bodyPatch) {
			Object.assign(payloadObj, finalResult.bodyPatch);
		}

		const finalPayload = JSON.stringify(payloadObj);

		console.log(chalk.cyan(`Firing ${opts.service} webhook to ${opts.url}`));
		console.log(chalk.dim(`  Event: ${opts.event ?? 'custom'}`));
		console.log(chalk.dim(`  Signature header: ${signer.signatureHeader}`));

		const response = await fetch(opts.url, {
			method: 'POST',
			headers: {
				...finalResult.headers,
				'content-length': Buffer.byteLength(finalPayload).toString(),
			},
			body: finalPayload,
		});

		const responseText = await response.text();

		if (response.ok) {
			console.log(chalk.green(`  Response: ${response.status} ${response.statusText}`));
		} else {
			console.log(chalk.red(`  Response: ${response.status} ${response.statusText}`));
			console.log(chalk.dim(`  Body: ${responseText.substring(0, 200)}`));
		}
	});

webhookCommand
	.command('list-services')
	.description('List all supported services and their signature schemes')
	.action(() => {
		const signers = listSigners();

		console.log(chalk.cyan(`\nSupported services (${signers.length}):\n`));
		console.log(
			chalk.dim(
				'Service'.padEnd(22) +
				'Algorithm'.padEnd(18) +
				'Header'.padEnd(32) +
				'Description',
			),
		);
		console.log(chalk.dim('-'.repeat(110)));

		for (const signer of signers) {
			console.log(
				chalk.white(signer.service.padEnd(22)) +
				chalk.yellow(signer.signatureAlgorithm.padEnd(18)) +
				chalk.blue(signer.signatureHeader.padEnd(32)) +
				chalk.dim(signer.description),
			);
		}
		console.log();
	});

webhookCommand
	.command('list-events')
	.description('List available event templates for a service')
	.requiredOption('-s, --service <service>', 'service name')
	.action((opts: { service: string }) => {
		const templateDir = resolve(
			import.meta.dirname ?? '.',
			'../templates',
			opts.service.toLowerCase(),
		);

		if (!existsSync(templateDir)) {
			console.log(chalk.yellow(`No event templates found for "${opts.service}".`));
			console.log(chalk.dim('You can create custom templates or use --payload / --payload-file.'));
			return;
		}

		const files = readdirSync(templateDir).filter((f) => f.endsWith('.json'));
		console.log(chalk.cyan(`\nEvent templates for ${opts.service}:\n`));
		for (const file of files) {
			console.log(`  ${file.replace('.json', '')}`);
		}
		console.log();
	});
