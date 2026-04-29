# AGENTS.md

Guidance for AI agents working on the n8n-node-mocker project.

## Project Overview

n8n-node-mocker is an HTTPS MITM proxy + webhook simulator for testing n8n
nodes without real API credentials. It intercepts outbound traffic from n8n
via `HTTPS_PROXY`, returns smart mock responses (or serves custom fixtures),
and fires correctly-signed webhook events to n8n's webhook endpoints.

## Architecture

```
src/
  index.ts                  CLI entry (commander)
  config.ts                 YAML config loader + defaults
  commands/
    init.ts                 CA certificate generation
    start.ts                Proxy startup
    webhook.ts              webhook fire / list-services / list-events
  proxy/
    mitm-proxy.ts           HTTPS MITM proxy core
    ca.ts                   CA + per-host TLS cert generation
    graphql-parser.ts       GraphQL operation name extraction
    service-hooks.ts        Per-provider custom logic (handshakes, secret capture)
  fixtures/
    fixture-store.ts        Read fixture JSON files
  signers/
    index.ts                Signer registry, interface, getSigner()
    linear.ts               One file per service
    ...
  templates/
    acuityscheduling/       Built-in webhook event payloads
    asana/
    calendly/
    customerio/
    figma/
    gitlab/
    linear/
    netlify/
    trello/
    twilio/
    typeform/
fixtures/                   Committed fixture files (per-hostname)
  acuityscheduling.com/     Acuity appointment responses
  api.calendly.com/         Calendly v2 API (users, webhook_subscriptions)
  api.customer.io/          Customer.io reporting webhooks
  api.figma.com/            Figma webhooks
  api.linear.app/           Linear GraphQL (Teams, webhookCreate, webhookDelete)
  api.netlify.com/          Netlify sites, hooks
  api.trello.com/           Trello credential test + webhook CRUD
  api.twilio.com/           Twilio account verification
  app.asana.com/            Asana workspaces, webhooks
  calendly.com/             Calendly v1 API (credential test, hooks)
  events.twilio.com/        Twilio Event Streams (Sinks, Subscriptions)
  gitlab.com/               GitLab project hooks
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
- **Query params on webhook URL**: return `queryParams` in `SignResult` to
  append params to the URL before sending (see `twilio.ts` -- `bodySHA256`)

### Step 3: Register the signer

In `src/signers/index.ts`:
1. Add `import { myServiceSigner } from './my-service.js';`
2. Add `myServiceSigner` to the `signers` array

### Step 4: Add event templates

Create `src/templates/<service-name>/` with JSON files for common events.
Name them after the event type (e.g. `issue.created.json`, `form_response.json`).

Build realistic payloads by referencing the service's webhook documentation.
Use test/fake data -- never include real user data or credentials.

### Step 5: Add default config

In `src/config.ts`, add a default entry in `DEFAULT_CONFIG.services`:

```typescript
myservice: { signingSecret: 'test' },
```

Also add the entry to `config.example.yaml`.

### Step 6: Write a test

Create `src/signers/<service-name>.test.ts`. At minimum, verify that:
1. The signer produces the expected HMAC digest
2. The correct header name is set
3. Any prefix/encoding matches the service's spec

### Step 7: Rebuild

```bash
pnpm build   # compiles TS + copies templates to dist/
pnpm test    # verify all tests pass
```

### Step 8: Check if the service needs a service hook

Some services have custom flows beyond simple request/response mocking.
Check if the service requires any of these patterns:

- **Handshake / callback**: Service sends a confirmation request back to
  n8n's webhook URL during registration (e.g. Asana's `X-Hook-Secret`)
- **Dynamic secret capture**: n8n generates a secret at registration time
  and the proxy needs to capture it for `webhook fire` to use later
  (e.g. Figma's passcode)
- **PING event**: Service sends a test event right after registration

If yes, add a hook in `src/proxy/service-hooks.ts`. See the existing
hooks for Asana and Figma as examples.

### Step 9: Check if `webhook fire` needs special handling

If the service's secret is dynamic (not from config), add auto-detection
logic in `src/commands/webhook.ts`. See the Figma passcode auto-detect
as an example -- it reads a captured value from a file instead of using
the static config secret.

## Checklist for Adding a Service

- [ ] Research: read the n8n trigger node + **official API webhook docs**
- [ ] Verify signing logic against official docs, not just n8n code
- [ ] Create `src/signers/<name>.ts` implementing `WebhookSigner` with `@see` URL to official API docs
- [ ] Register in `src/signers/index.ts`
- [ ] Add event templates in `src/templates/<name>/`
- [ ] Add fixtures in `fixtures/<hostname>/` for common follow-up API calls
- [ ] Check for pagination loops: APIs wrapping responses in `{data: [], next_page: null}` need fixtures, not smart fallback
- [ ] Add service hook in `src/proxy/service-hooks.ts` if needed (handshake, dynamic secrets, PING)
- [ ] Add auto-detection in `src/commands/webhook.ts` if secret is dynamic
- [ ] Add default secret in `src/config.ts` and `config.example.yaml`
- [ ] Write test in `src/signers/<name>.test.ts`
- [ ] `pnpm build && pnpm test` passes
- [ ] Add testing instructions in `TESTING.md`
- [ ] Update the service table in `README.md` if needed

## Service Hooks (`src/proxy/service-hooks.ts`)

Service hooks run after the proxy sends a mock response. They handle
provider-specific flows that go beyond simple request/response mocking.

### How hooks work

```typescript
interface ServiceHook {
  match: (ctx: ServiceHookContext) => boolean;  // when to trigger
  run: (ctx: ServiceHookContext) => void;       // what to do
}
```

The proxy calls `runPostResponseHooks()` after every mock response.
Each hook checks if its `match` function returns true, then runs.

### Existing hooks

| Service | Hook | What it does |
|---------|------|-------------|
| **Asana** | `asanaHandshake` | After `POST /webhooks`, sends `X-Hook-Secret` to n8n's webhook URL. n8n stores this secret for future HMAC verification. Uses the signing secret from config. |
| **Figma** | `figmaCapturePasscode` | After `POST /webhooks`, reads the `passcode` from n8n's request body and saves it to `~/.n8n-node-mocker/figma-passcode.txt`. The `webhook fire` command auto-reads this file so it can inject the correct passcode into events. |
| **GitLab** | `gitlabCaptureToken` | After `POST /hooks`, reads the `token` field from n8n's request body and saves it to `~/.n8n-node-mocker/gitlab-token.txt`. |
| **Netlify** | `netlifyCaptureSecret` | After `POST /hooks`, reads `data.signature_secret` from n8n's request body and saves it to `~/.n8n-node-mocker/netlify-secret.txt`. Used for JWT signing. |

### Adding a new hook

1. Add an entry to the `hooks` array in `service-hooks.ts`
2. Write a `match` function (check hostname, method, path)
3. Write a `run` function with the custom logic
4. Add a `@see` link to the official API docs explaining the flow
5. If the hook captures dynamic secrets, update `webhook.ts` to auto-detect them

### Common patterns that need hooks

- **Handshake callbacks**: Service confirms webhook registration by
  calling back to the webhook URL (Asana, potentially others)
- **Dynamic secret capture**: n8n generates a secret during registration
  that the proxy must capture for later use (Figma passcode)
- **Subscription confirmation**: Service sends a confirmation URL that
  must be fetched to activate the webhook (AWS SNS)
- **Pagination-sensitive endpoints**: If an API wraps responses in a
  custom envelope (e.g. `{data: [], next_page: null}`), a fixture is
  needed instead of the smart fallback to prevent infinite loops

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
| Query params on URL | sha1 | base64 | `twilio.ts` (bodySHA256 appended to URL) |
| JWT (JWS) | HS256 | base64 | `netlify.ts` |

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
  queryParams?: Record<string, string>; // query params to append to webhook URL
}
```

## Fixtures

Fixtures live in `fixtures/` and are **committed to the repo** so everyone
gets them. When adding a new service, always add fixtures for common
follow-up API calls that trigger nodes make after receiving a webhook.

### Fixture matching

URL path `/` is replaced with `_`. The proxy tries an exact match first,
then walks up the path tree:

```
GET /api/v1/appointments/12345 →
  1. fixtures/acuityscheduling.com/api_v1_appointments_12345/GET.json  (exact)
  2. fixtures/acuityscheduling.com/api_v1_appointments/GET.json        (any ID ✓)
  3. fixtures/acuityscheduling.com/_fallback.json                      (host catch-all)
```

Place fixtures at the resource-type level (without the ID) so a single file
handles all IDs.

### File format

```json
{
  "response": {
    "statusCode": 200,
    "headers": { "content-type": "application/json" },
    "body": { "id": 101234567, "firstName": "Jane", "email": "jane@example.com" }
  }
}
```

GraphQL fixtures are matched by operation name (e.g. `IssueCreate.json`).
REST fixtures are matched by HTTP method (e.g. `GET.json`, `POST.json`).
A `_fallback.json` in any directory serves as a catch-all.

### Checklist for adding fixtures

- [ ] Check proxy logs for `FALLBACK` lines to find which URLs need fixtures
- [ ] Convert the URL path: replace `/` with `_`, drop dynamic ID segments
- [ ] Create the directory under `fixtures/<hostname>/`
- [ ] Reference the real API docs for a realistic response shape
- [ ] Use fake but realistic data (names, emails, dates) -- never real user data
- [ ] Commit the fixture to the repo so others get it too

## Style Guidelines

- TypeScript strict mode, ESM (`"type": "module"`)
- Node.js >= 18
- Use `node:crypto` for all HMAC operations (no external crypto libs)
- One signer per file, exported as a named const
- Keep signers small and focused (20-40 lines typical)
- Test file lives next to the source file (`<name>.test.ts`)
