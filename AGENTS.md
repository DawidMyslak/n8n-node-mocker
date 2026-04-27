# AGENTS.md

Guidance for AI agents working on the n8n-node-mocker project.

## Project Overview

n8n-node-mocker is an HTTPS MITM proxy + webhook simulator for testing n8n
nodes without real API credentials. It intercepts outbound traffic from n8n
via `HTTPS_PROXY`, records/replays API responses as fixtures, and fires
correctly-signed webhook events to n8n's webhook endpoints.

## Architecture

```
src/
  index.ts                  CLI entry (commander)
  config.ts                 YAML config loader + defaults
  commands/
    init.ts                 CA certificate generation
    start.ts                Proxy startup (record/mock)
    webhook.ts              webhook fire / list-services / list-events
  proxy/
    mitm-proxy.ts           HTTPS MITM proxy core
    ca.ts                   CA + per-host TLS cert generation
    request-matcher.ts      Request → fixture path mapping
    graphql-parser.ts       GraphQL operation name extraction
  fixtures/
    fixture-store.ts        Read/write fixture JSON files
    sanitizer.ts            Redact sensitive headers
  signers/
    index.ts                Signer registry, interface, getSigner()
    linear.ts               One file per service (20 total)
    ...
  templates/
    linear/                 Built-in webhook event payloads
      issue.created.json
    ...
```

## How to Add a New Fake API / Service

Follow these steps whenever you need to add support for a new n8n trigger
node's webhook signature and event templates.

### Step 1: Research the signature scheme

Look at the n8n trigger node implementation to understand how it verifies
incoming webhooks. The key files are:

- `packages/nodes-base/nodes/<Service>/<Service>Trigger.node.ts`
- `packages/nodes-base/nodes/<Service>/<Service>TriggerHelpers.ts`

Most nodes use `verifySignature()` from
`packages/nodes-base/utils/webhook-signature-verification.ts`.

Identify:
- **Algorithm**: HMAC-SHA256, HMAC-SHA1, HMAC-SHA512, token match, or other
- **Header name**: e.g. `x-hub-signature-256`, `x-gitlab-token`
- **Digest encoding**: hex, base64
- **Prefix**: e.g. `sha256=` before the digest (Typeform), or none (Linear)
- **Timestamp**: where it lives (body field, header, not used)
- **Special data**: some services sign `body + callbackURL` (Trello),
  `timestamp.body` (Figma/Calendly), or use the secret as a plain token
  (GitLab)

### Step 2: Create the signer file

Create `src/signers/<service-name>.ts`. Use an existing signer as a template.

**Every signer must include a JSDoc `@see` link to the official API
documentation for the service's webhook signature verification.** This is
mandatory -- it allows future maintainers to re-verify the implementation.
Example:

```typescript
/**
 * Linear signs webhooks using HMAC-SHA256 of the raw request body.
 * The hex-encoded signature is sent in the `Linear-Signature` header.
 *
 * @see https://linear.app/developers/webhooks
 */
```

The most common pattern (HMAC-SHA256, hex, custom header):

```typescript
import { createHmac } from 'node:crypto';
import type { WebhookSigner, SignResult } from './index.js';

export const myServiceSigner: WebhookSigner = {
  service: 'myservice',           // lowercase, used in CLI --service flag
  description: 'HMAC-SHA256, hex, X-My-Signature header',
  signatureAlgorithm: 'HMAC-SHA256',
  signatureHeader: 'x-my-signature',

  sign(payload: Buffer, secret: string): SignResult {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    return {
      headers: {
        'x-my-signature': hmac.digest('hex'),
        'content-type': 'application/json',
      },
    };
  },
};
```

Variations to handle:
- **base64 encoding**: use `.digest('base64')` instead of `'hex'`
- **Prefix**: return `sha256=${hmac.digest('base64')}` in the header value
- **Timestamp in signature data**: concatenate `${timestamp}.${body}` before
  HMAC, return timestamp in header (see `calendly.ts`, `figma.ts`)
- **Body patch**: use `bodyPatch` to inject fields into the JSON body before
  sending, e.g. `webhookTimestamp` for Linear
- **Token-based**: just return the secret as the header value (see `gitlab.ts`)
- **URL in signature**: use `meta.webhookUrl` (see `trello.ts`, `twilio.ts`)

### Step 3: Register the signer

In `src/signers/index.ts`:
1. Add `import { myServiceSigner } from './my-service.js';`
2. Add `myServiceSigner` to the `signers` array

### Step 4: Add event templates

Create `src/templates/<service-name>/` with JSON files for common events.
Name them after the event type (e.g. `issue.created.json`, `form_response.json`).

Build realistic payloads by referencing the service's webhook documentation
or by recording real events in record mode. Use test/fake data -- never
include real user data or credentials.

### Step 5: Add default config

In `src/config.ts`, add a default entry in `DEFAULT_CONFIG.services`:

```typescript
myservice: { signingSecret: 'test-secret-myservice' },
```

Also add the entry to `config.example.yaml`.

### Step 6: Write a test

Create `src/signers/<service-name>.test.ts`. At minimum, verify that:
1. The signer produces the expected HMAC digest
2. The correct header name is set
3. Any prefix/encoding matches the service's spec

For critical services, write an e2e test (see `src/e2e-linear.test.ts`)
that reproduces n8n's exact verification logic.

### Step 7: Rebuild

```bash
pnpm build   # compiles TS + copies templates to dist/
pnpm test    # verify all tests pass
```

## Checklist for Adding a Service

- [ ] Research: read the n8n trigger node + service webhook docs
- [ ] Create `src/signers/<name>.ts` implementing `WebhookSigner` with `@see` URL to official API docs
- [ ] Register in `src/signers/index.ts`
- [ ] Add event templates in `src/templates/<name>/`
- [ ] Add default secret in `src/config.ts` and `config.example.yaml`
- [ ] Write test in `src/signers/<name>.test.ts`
- [ ] `pnpm build && pnpm test` passes
- [ ] Update the service table in `README.md` if needed

## Common Signer Patterns (reference)

| Pattern | Algorithm | Encoding | Example |
|---------|-----------|----------|---------|
| Simple HMAC | sha256 | hex | `linear.ts`, `cal.ts`, `customerio.ts` |
| HMAC + prefix | sha256 | base64 | `typeform.ts` (`sha256=` prefix) |
| HMAC + timestamp in data | sha256 | hex | `figma.ts`, `calendly.ts` |
| HMAC + timestamp header | sha256 | base64 | `box.ts` |
| HMAC-SHA1 | sha1 | base64/hex | `trello.ts`, `taiga.ts` |
| HMAC-SHA512 | sha512 | hex | `onfleet.ts` |
| Plain token | n/a | n/a | `gitlab.ts` |
| Body patch | varies | varies | `linear.ts` (webhookTimestamp), `microsoft-teams.ts` (clientState) |
| URL in signing data | sha1 | base64 | `twilio.ts`, `trello.ts` |

## Build & Test

```bash
pnpm install        # install dependencies
pnpm build          # compile TypeScript + copy templates to dist/
pnpm test           # run vitest
pnpm dev            # watch mode via tsx
```

## Key Interfaces

```typescript
interface WebhookSigner {
  service: string;                    // lowercase name for CLI
  description: string;               // human-readable summary
  signatureAlgorithm: string;        // for display in list-services
  signatureHeader: string;           // primary header name
  sign(payload: Buffer, secret: string, meta?: SignMeta): SignResult;
}

interface SignMeta {
  webhookUrl?: string;               // callback URL (Twilio, Trello)
  timestamp?: number;                // override auto-generated timestamp
}

interface SignResult {
  headers: Record<string, string>;   // headers to set on the webhook POST
  bodyPatch?: Record<string, unknown>; // fields to merge into JSON body
}
```

## Fixture Format

Each fixture file is a JSON object:

```json
{
  "request": {
    "method": "POST",
    "host": "api.linear.app",
    "path": "/graphql",
    "headers": { "authorization": "[REDACTED]" },
    "body": { "query": "mutation IssueCreate ..." }
  },
  "response": {
    "statusCode": 200,
    "headers": { "content-type": "application/json" },
    "body": { "data": { "issueCreate": { "success": true } } }
  },
  "operationName": "IssueCreate",
  "recordedAt": "2026-04-27T21:00:00.000Z"
}
```

Fixtures are matched by host + path + GraphQL operation name (for POST
requests). REST requests fall back to method-based matching. A `_fallback.json`
in any directory serves as a catch-all.

## Style Guidelines

- TypeScript strict mode, ESM (`"type": "module"`)
- Node.js >= 18
- Use `node:crypto` for all HMAC operations (no external crypto libs)
- One signer per file, exported as a named const
- Keep signers small and focused (20-40 lines typical)
- Test file lives next to the source file (`<name>.test.ts`)
