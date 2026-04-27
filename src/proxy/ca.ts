import { readFileSync, writeFileSync } from 'node:fs';

import forge from 'node-forge';

export function generateCA(certPath: string, keyPath: string): void {
	const keys = forge.pki.rsa.generateKeyPair(2048);
	const cert = forge.pki.createCertificate();

	cert.publicKey = keys.publicKey;
	cert.serialNumber = '01';
	cert.validity.notBefore = new Date();
	cert.validity.notAfter = new Date();
	cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

	const attrs = [
		{ name: 'commonName', value: 'n8n-node-mocker CA' },
		{ name: 'organizationName', value: 'n8n-node-mocker' },
	];

	cert.setSubject(attrs);
	cert.setIssuer(attrs);
	cert.setExtensions([
		{ name: 'basicConstraints', cA: true },
		{
			name: 'keyUsage',
			keyCertSign: true,
			digitalSignature: true,
			cRLSign: true,
		},
	]);

	cert.sign(keys.privateKey, forge.md.sha256.create());

	writeFileSync(certPath, forge.pki.certificateToPem(cert));
	writeFileSync(keyPath, forge.pki.privateKeyToPem(keys.privateKey));
}

export function generateServerCert(
	hostname: string,
	caCertPem: string,
	caKeyPem: string,
): { cert: string; key: string } {
	const caCert = forge.pki.certificateFromPem(caCertPem);
	const caKey = forge.pki.privateKeyFromPem(caKeyPem);
	const keys = forge.pki.rsa.generateKeyPair(2048);
	const cert = forge.pki.createCertificate();

	cert.publicKey = keys.publicKey;
	cert.serialNumber = Date.now().toString(16);
	cert.validity.notBefore = new Date();
	cert.validity.notAfter = new Date();
	cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

	cert.setSubject([{ name: 'commonName', value: hostname }]);
	cert.setIssuer(caCert.subject.attributes);
	cert.setExtensions([
		{ name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] },
	]);

	cert.sign(caKey, forge.md.sha256.create());

	return {
		cert: forge.pki.certificateToPem(cert),
		key: forge.pki.privateKeyToPem(keys.privateKey),
	};
}

export interface CAKeyPair {
	certPem: string;
	keyPem: string;
}

export function loadCA(caDir: string): CAKeyPair {
	return {
		certPem: readFileSync(`${caDir}/ca.pem`, 'utf-8'),
		keyPem: readFileSync(`${caDir}/ca-key.pem`, 'utf-8'),
	};
}
