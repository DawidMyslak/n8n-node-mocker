import { acuitySchedulingSigner } from './acuity-scheduling.js';
import { asanaSigner } from './asana.js';
import { awsSnsSigner } from './aws-sns.js';
import { calSigner } from './cal.js';
import { calendlySigner } from './calendly.js';
import { customerIoSigner } from './customer-io.js';
import { figmaSigner } from './figma.js';
import { formstackSigner } from './formstack.js';
import { gitlabSigner } from './gitlab.js';
import { linearSigner } from './linear.js';
import { mailerLiteSigner } from './mailerlite.js';
import { mauticSigner } from './mautic.js';
import { netlifySigner } from './netlify.js';
import { onfleetSigner } from './onfleet.js';
import { taigaSigner } from './taiga.js';
import { trelloSigner } from './trello.js';
import { twilioSigner } from './twilio.js';
import { typeformSigner } from './typeform.js';

export interface SignMeta {
	webhookUrl?: string;
	timestamp?: number;
}

export interface SignResult {
	headers: Record<string, string>;
	/** Modifications to merge into the JSON body (e.g. webhookTimestamp for Linear) */
	bodyPatch?: Record<string, unknown>;
	/** Query params to append to the webhook URL before sending (e.g. bodySHA256 for Twilio) */
	queryParams?: Record<string, string>;
}

export interface WebhookSigner {
	service: string;
	description: string;
	signatureAlgorithm: string;
	signatureHeader: string;
	sign(payload: Buffer, secret: string, meta?: SignMeta): SignResult;
}

const signers: WebhookSigner[] = [
	linearSigner,
	typeformSigner,
	figmaSigner,
	gitlabSigner,
	trelloSigner,
	twilioSigner,
	asanaSigner,
	netlifySigner,
	acuitySchedulingSigner,
	awsSnsSigner,
	calSigner,
	calendlySigner,
	customerIoSigner,
	formstackSigner,
	mailerLiteSigner,
	mauticSigner,
	onfleetSigner,
	taigaSigner,
];

const signerMap = new Map<string, WebhookSigner>();
for (const signer of signers) {
	signerMap.set(signer.service, signer);
}

export function getSigner(service: string): WebhookSigner | undefined {
	return signerMap.get(service.toLowerCase());
}

export function listSigners(): WebhookSigner[] {
	return [...signers];
}
