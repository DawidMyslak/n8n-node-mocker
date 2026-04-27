# n8n-node-mocker

MITM proxy + webhook simulator for testing n8n nodes without real API credentials.

Intercepts all HTTPS traffic from n8n, records real API responses as fixtures, replays them in mock mode, and fires correctly-signed webhook events -- enabling full end-to-end node testing without touching the real APIs.

**Zero changes to n8n required.** Works entirely through standard environment variables (`HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS`).

## Quick Start

```bash
# Clone and build
git clone <repo-url> && cd n8n-node-mocker
pnpm install
pnpm build

# Generate a CA certificate (one-time setup)
npx n8n-node-mocker init

# Start the proxy in mock mode
npx n8n-node-mocker start --mode mock
```

## Using with n8n

Start n8n with two environment variables to route all traffic through the proxy:

```bash
# In the n8n repo directory
NODE_EXTRA_CA_CERTS=~/.n8n-node-mocker/ca.pem \
HTTPS_PROXY=http://localhost:9090 \
pnpm dev
```

That's it. All outbound HTTPS requests from n8n nodes now flow through the proxy.

## How It Works

```
                          HTTPS_PROXY
┌─────────┐            ┌──────────────┐           ┌──────────────┐
│  n8n    │───────────▸│ n8n-node-    │──record──▸│  Real API    │
│ (5678)  │            │ mocker (9090)│           │ (linear.app) │
└─────────┘            └──────────────┘           └──────────────┘
     ▲                       │
     │                  mock mode:
     │                  serves fixtures
     │
┌─────────┐
│ webhook │  n8n-node-mocker webhook fire
│ fire    │──────────────────┘
└─────────┘
```

The proxy performs HTTPS interception (MITM) using a locally-generated CA certificate. n8n trusts this CA via `NODE_EXTRA_CA_CERTS`.

## Modes

### Record Mode

Forwards requests to the real API, saves request/response pairs as JSON fixture files.

```bash
npx n8n-node-mocker start --mode record
```

Output:
```
RECORDED: POST api.linear.app/graphql [IssueCreate] -> 200
  -> /path/to/fixtures/api.linear.app/graphql/IssueCreate.json
```

Fixtures are stored organized by hostname, path, and GraphQL operation name:
```
fixtures/
  api.linear.app/
    graphql/
      IssueCreate.json
      IssueGet.json
      webhookCreate.json
```

### Mock Mode

Serves saved fixtures instead of hitting real APIs. Returns 501 for unrecorded requests.

```bash
npx n8n-node-mocker start --mode mock
```

Output:
```
MOCKED: POST api.linear.app/graphql [IssueCreate] -> 200
NO FIXTURE: POST api.linear.app/graphql [CommentCreate]
```

## Webhook Simulation

Fire correctly-signed webhook events to n8n's webhook endpoints.

### Fire an event using a built-in template

```bash
npx n8n-node-mocker webhook fire \
  --service linear \
  --url http://localhost:5678/webhook/abc123 \
  --event issue.created
```

The tool automatically:
1. Loads the event template
2. Injects timestamps (e.g. `webhookTimestamp` for Linear)
3. Computes the HMAC signature using the configured secret
4. Sets the correct signature header (`linear-signature`)
5. POSTs to the n8n webhook URL

### Fire with a custom payload

```bash
npx n8n-node-mocker webhook fire \
  --service figma \
  --url http://localhost:5678/webhook/xyz \
  --payload '{"event_type":"FILE_UPDATE","file_key":"abc"}'
```

### Fire from a payload file

```bash
npx n8n-node-mocker webhook fire \
  --service typeform \
  --url http://localhost:5678/webhook/xyz \
  --payload-file ./my-custom-event.json
```

### List supported services

```bash
npx n8n-node-mocker webhook list-services
```

### List event templates for a service

```bash
npx n8n-node-mocker webhook list-events --service linear
```

## Configuration

Copy `config.example.yaml` to `config.yaml` and adjust:

```yaml
port: 9090
fixturesDir: ./fixtures
caDir: ~/.n8n-node-mocker

services:
  linear:
    signingSecret: "your-secret-here"
  typeform:
    signingSecret: "your-secret-here"
  # ... more services
```

**Important:** The `signingSecret` for each service must match the signing secret configured in the corresponding n8n credential. For example, the Linear API credential in n8n has a "Signing Secret" field -- use the same value here.

## Supported Services (20)

All webhook trigger nodes from [NODE-4297](https://linear.app/n8n/issue/NODE-4297):

| Service | Algorithm | Signature Header | Notes |
|---------|-----------|-----------------|-------|
| Linear | HMAC-SHA256 | `linear-signature` | hex, + `webhookTimestamp` in body |
| Typeform | HMAC-SHA256 | `typeform-signature` | `sha256=` + base64 |
| Figma | HMAC-SHA256 | `x-figma-signature` | `t=timestamp,v1=signature` |
| GitLab | Token | `x-gitlab-token` | Simple token match |
| Trello | HMAC-SHA1 | `x-trello-webhook` | base64, includes callback URL |
| Twilio | HMAC-SHA1 | `x-twilio-signature` | URL + sorted params |
| Asana | HMAC-SHA256 | `x-hook-signature` | hex |
| Netlify | HMAC-SHA256 | `x-webhook-signature` | base64 |
| Acuity Scheduling | HMAC-SHA256 | `acuity-webhook-signature` | base64 |
| AWS SNS | RSA-SHA256 | `x-amz-sns-message-type` | Certificate-based (placeholder) |
| Box | HMAC-SHA256 | `box-signature-primary` | base64, + delivery timestamp |
| Cal.com | HMAC-SHA256 | `x-cal-signature-256` | hex |
| Calendly | HMAC-SHA256 | `calendly-webhook-signature` | `t=timestamp,v1=signature` |
| Customer.io | HMAC-SHA256 | `x-cio-signature` | hex |
| Formstack | HMAC-SHA256 | `x-fs-signature` | base64 |
| MailerLite | HMAC-SHA256 | `signature` | hex |
| Mautic | HMAC-SHA256 | `webhook-signature` | base64 |
| Microsoft Teams | HMAC-SHA256 | (body) | `clientState` in body |
| Onfleet | HMAC-SHA512 | `x-onfleet-signature` | hex |
| Taiga | HMAC-SHA1 | `x-taiga-webhook-signature` | hex |

## Adding a New Service

1. Create `src/signers/my-service.ts`:

```typescript
import { createHmac } from 'node:crypto';
import type { WebhookSigner, SignResult } from './index.js';

export const myServiceSigner: WebhookSigner = {
  service: 'myservice',
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

2. Register it in `src/signers/index.ts`.

3. Add event templates in `src/templates/myservice/`.

4. Add the secret to `config.yaml`.

5. Rebuild: `pnpm build`.

## Full Workflow Example (Linear)

```bash
# Terminal 1: Start the proxy
npx n8n-node-mocker start --mode mock --port 9090

# Terminal 2: Start n8n with proxy
cd /path/to/n8n
NODE_EXTRA_CA_CERTS=~/.n8n-node-mocker/ca.pem \
HTTPS_PROXY=http://localhost:9090 \
pnpm dev

# In n8n UI:
# 1. Create a Linear API credential with signing secret "test-secret-linear"
# 2. Create a workflow with LinearTrigger node
# 3. Activate the workflow (proxy will mock the webhook registration)

# Terminal 3: Fire a test webhook
npx n8n-node-mocker webhook fire \
  --service linear \
  --url http://localhost:5678/webhook/<your-webhook-id> \
  --event issue.created

# n8n receives the webhook, verifies the signature, and processes it
```

## Development

```bash
pnpm install        # Install dependencies
pnpm build          # Compile TypeScript + copy templates
pnpm dev            # Watch mode with tsx
pnpm test           # Run tests
pnpm lint           # Lint
```

## Architecture

```
src/
  index.ts                      # CLI entry point (commander)
  config.ts                     # YAML config loader
  commands/
    init.ts                     # CA certificate generation
    start.ts                    # Proxy startup
    webhook.ts                  # Webhook fire/list commands
  proxy/
    mitm-proxy.ts               # HTTPS MITM proxy core
    ca.ts                       # CA + server certificate generation
    request-matcher.ts          # Request-to-fixture matching
    graphql-parser.ts           # GraphQL operation name extraction
  fixtures/
    fixture-store.ts            # Fixture file I/O
    sanitizer.ts                # Sensitive header redaction
  signers/
    index.ts                    # Signer registry + interface
    linear.ts, typeform.ts ...  # Per-service signers (20 total)
  templates/
    linear/                     # Built-in event payloads
    typeform/
    figma/
```

## How `NODE_EXTRA_CA_CERTS` Works

`NODE_EXTRA_CA_CERTS` is a standard Node.js environment variable. It tells Node.js to trust additional CA certificates beyond the system defaults. When the proxy intercepts HTTPS traffic, it presents TLS certificates signed by its local CA. Setting this env var makes n8n trust those certificates.

- One-time setup: `npx n8n-node-mocker init`
- No system-wide changes, no `sudo`, no browser configuration
- Only affects the n8n process that sets the variable

## License

MIT
