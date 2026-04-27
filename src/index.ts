#!/usr/bin/env node
import { Command } from 'commander';

import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { webhookCommand } from './commands/webhook.js';

const program = new Command();

program
	.name('n8n-node-mocker')
	.description('MITM proxy + webhook simulator for testing n8n nodes')
	.version('0.1.0');

program.addCommand(initCommand);
program.addCommand(startCommand);
program.addCommand(webhookCommand);

program.parse();
