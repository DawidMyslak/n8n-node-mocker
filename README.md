# n8n-node-mocker

MITM proxy + webhook simulator for testing n8n nodes without real API credentials.

Intercepts all HTTPS traffic from n8n, returns smart mock responses for any API call, and fires correctly-signed webhook events -- enabling full end-to-end node testing without touching the real APIs.

**Zero changes to n8n required.** Works entirely through standard environment variables (`HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS`).

## Quick Start

```bash
# Clone and build
git clone <repo-url> && cd n8n-node-mocker
pnpm install
pnpm build

# Generate a CA certificate (one-time setup)
npx n8n-node-mocker init

# Start the proxy
npx n8n-node-mocker start
```

## Using with n8n

Start n8n with the proxy environment variables. Use `pnpm start` (not `pnpm dev`)
to avoid dev tooling (Turbo, Vite, Storybook) picking up `HTTPS_PROXY` and failing:

```bash
# In the n8n repo directory -- build first (one-time after checkout)
pnpm build

# Start n8n through the proxy
NODE_EXTRA_CA_CERTS=~/.n8n-node-mocker/ca.pem \
HTTPS_PROXY=http://127.0.0.1:9090 \
NO_PROXY=telemetry.n8n.io,ph.n8n.io \
pnpm start
```

**Important:**
- Use `127.0.0.1` (not `localhost`) to avoid IPv6 resolution issues on macOS.
- `NO_PROXY` excludes n8n's telemetry endpoints which flood the proxy with
  dozens of concurrent requests. Only actual API calls need to go through it.

All outbound HTTPS requests from n8n nodes now flow through the proxy.

## How It Works

```
                          HTTPS_PROXY
┌─────────┐            ┌──────────────┐
│  n8n    │───────────▸│ n8n-node-    │──▸ smart mock responses
│ (5678)  │            │ mocker (9090)│    (or fixture files)
└─────────┘            └──────────────┘
     ▲
     │
┌─────────┐
│ webhook │  npx n8n-node-mocker webhook fire
│ fire    │──────────────────┘
└─────────┘
```

The proxy performs HTTPS interception (MITM) using a locally-generated CA certificate. n8n trusts this CA via `NODE_EXTRA_CA_CERTS`.

## Mock Responses

Every intercepted HTTPS request gets a smart fallback response (HTTP 200 with a
sensible JSON body) so that n8n stays fully responsive. The proxy uses heuristics
based on the HTTP method:

| Method | Fallback Response |
|--------|------------------|
| GET (list endpoint) | `[]` |
| GET (single resource) | `{ "id": "...", "name": "Mock Resource" }` |
| POST | `{ "id": "mock-<uuid>", "success": true }` |
| PUT / PATCH | `{ "success": true, "updated": true }` |
| DELETE | `{ "success": true, "deleted": true }` |
| GraphQL | `{ "data": {} }` |

Output:
```
FALLBACK: GET  api.acuity.com/api/v1/webhooks -> 200 (auto)
FALLBACK: POST api.linear.app/graphql [IssueCreate] -> 200 (auto)
```

### Fixtures

The `fixtures/` directory ships with built-in realistic responses for common
follow-up API calls (e.g. fetching appointment details after a webhook fires).
The proxy checks for a matching fixture first and uses the smart fallback only
when none is found.

**Contributing fixtures is encouraged!** If you're testing a service and the
smart fallback isn't realistic enough, add a fixture file and open a PR.
More fixtures = better testing experience for everyone.

#### How fixture matching works

URL path segments are joined with `_`. The proxy tries an exact match first,
then walks up the path tree until it finds one:

```
GET /api/v1/appointments/12345 →
  1. fixtures/acuityscheduling.com/api_v1_appointments_12345/GET.json  (exact ID)
  2. fixtures/acuityscheduling.com/api_v1_appointments/GET.json        (any ID ✓)
  3. fixtures/acuityscheduling.com/_fallback.json                      (host catch-all)
```

This means a single fixture at the resource-type level (without the ID) handles
all IDs under that path.

#### Directory layout

```
fixtures/
  acuityscheduling.com/
    api_v1_appointments/
      GET.json              # Matches GET /api/v1/appointments/<any-id>
  api.linear.app/
    graphql/
      Teams.json            # Matched by GraphQL operation name
      webhookCreate.json
      POST.json             # Fallback for unnamed GraphQL queries
  api.example.com/
    api_v1_users/
      GET.json              # Matched by HTTP method
      _fallback.json        # Catch-all for this path
```

#### Fixture file format

Each fixture is a JSON file with a `response` object:

```json
{
  "response": {
    "statusCode": 200,
    "headers": { "content-type": "application/json" },
    "body": {
      "id": 101234567,
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane.doe@example.com"
    }
  }
}
```

#### Adding a fixture

1. Check the proxy logs to see what URL n8n is calling (e.g. `FALLBACK: GET acuityscheduling.com/api/v1/appointments/12345`)
2. Convert the URL path: replace `/` with `_`, drop the dynamic ID segment
3. Create the directory and a `GET.json` (or `POST.json`, etc.) inside it
4. Look at the real API docs for a realistic response shape
5. Restart the proxy -- fixtures are loaded on each request, no rebuild needed

To get strict 501 errors when no fixture exists (useful for ensuring full
coverage), set `fallbackMode: error` in `config.yaml`.

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

# What to do when no fixture matches:
#   auto  - return smart 200 defaults (recommended)
#   error - return 501 (strict mode)
fallbackMode: auto

services:
  linear:
    signingSecret: "test"
  typeform:
    signingSecret: "test"
  # ... all services default to "test"
```

**All services use `test` as the default signing secret.** When creating credentials
in n8n, just type `test` in any signing secret / API key field. One value to
remember, works everywhere.

## Supported Services

All n8n webhook trigger nodes that support signature verification.
Each signer has been verified against the official API documentation.

| Service | Algorithm | Signature Header | Verified Against | Tested | Notes |
|---------|-----------|-----------------|-----------------|--------|-------|
| Acuity Scheduling | HMAC-SHA256 | `x-acuity-signature` | [API docs](https://developers.acuityscheduling.com/docs/webhooks) | Yes | base64 |
| Asana | HMAC-SHA256 | `x-hook-signature` | [API docs](https://developers.asana.com/docs/webhooks-guide#security) | Yes | hex, X-Hook-Secret handshake |
| Figma | Passcode | (in body) | [API docs](https://developers.figma.com/docs/rest-api/webhooks-security/) | Yes | Passcode field echoed in event body |
| GitLab | Token | `x-gitlab-token` | [API docs](https://docs.gitlab.com/ee/user/project/integrations/webhooks.html) | Yes | Simple token match, not HMAC |
| Linear | HMAC-SHA256 | `linear-signature` | [API docs](https://developers.linear.app/docs/graphql/webhooks) | Yes | hex, + `webhookTimestamp` in body |
| Netlify | JWT (HS256) | `x-webhook-signature` | [API docs](https://docs.netlify.com/site-deploys/notifications/#payload-signature) | Yes | JWS token with sha256 of body |
| Typeform | HMAC-SHA256 | `typeform-signature` | [API docs](https://www.typeform.com/developers/webhooks/secure-your-webhooks/) | | `sha256=` + base64 |
| AWS SNS | RSA-SHA256 | `x-amz-sns-message-type` | [API docs](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html) | | Certificate-based (placeholder) |
| Box | HMAC-SHA256 | `box-signature-primary` | [API docs](https://box.dev/guides/webhooks/v2/signatures-v2) | | base64, body + timestamp bytes |
| Cal.com | HMAC-SHA256 | `x-cal-signature-256` | [API docs](https://cal.com/docs/core-features/webhooks) | | hex |
| Calendly | HMAC-SHA256 | `calendly-webhook-signature` | [API docs](https://developer.calendly.com/api-docs/4c305798a61d3-webhook-signatures) | Yes | `t=timestamp,v1=signature` |
| Customer.io | HMAC-SHA256 | `x-cio-signature` | [API docs](https://docs.customer.io/messaging/webhooks-action/) | Yes | hex, signs `v0:timestamp:body` |
| Formstack | HMAC-SHA256 | `x-fs-signature` | [API docs](https://developers.formstack.com/reference/webhook) | | `sha256=` prefix + hex |
| MailerLite | HMAC-SHA256 | `signature` | [API docs](https://developers.mailerlite.com/docs/webhooks) | | hex (new API), base64 (classic) |
| Mautic | HMAC-SHA256 | `webhook-signature` | [API docs](https://devdocs.mautic.org/en/5.x/webhooks/getting_started.html) | | base64 |
| Microsoft Teams | clientState | (in body) | [API docs](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks) | | Graph change notification clientState |
| Onfleet | HMAC-SHA512 | `x-onfleet-signature` | [API docs](https://docs.onfleet.com/reference/secrets) | | hex, secret is hex-encoded key |
| Taiga | HMAC-SHA1 | `x-taiga-webhook-signature` | [API docs](https://docs.taiga.io/webhooks.html) | | hex |
| Trello | HMAC-SHA1 | `x-trello-webhook` | [API docs](https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/) | Yes | base64, signs body + callbackURL |
| Twilio | HMAC-SHA1 | `x-twilio-signature` | [API docs](https://www.twilio.com/docs/usage/webhooks/webhooks-security) | Yes | base64, bodySHA256 query param + URL signing |

## Testing Each Service

See **[TESTING.md](TESTING.md)** for step-by-step instructions to test
each supported trigger node -- including exact credential values, node
configuration, and the `webhook fire` command to run.

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
npx n8n-node-mocker start

# Terminal 2: Start n8n with proxy
cd /path/to/n8n
NODE_EXTRA_CA_CERTS=~/.n8n-node-mocker/ca.pem \
HTTPS_PROXY=http://127.0.0.1:9090 \
NO_PROXY=telemetry.n8n.io,ph.n8n.io \
pnpm start

# In n8n UI:
# 1. Create a credential -- use "test" as the signing/API secret
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
    graphql-parser.ts           # GraphQL operation name extraction
    service-hooks.ts            # Per-provider custom logic (handshakes, secret capture)
  fixtures/
    fixture-store.ts            # Fixture file I/O
  signers/
    index.ts                    # Signer registry + interface
    linear.ts, typeform.ts ...  # Per-service signers (20 total)
  templates/
    acuityscheduling/           # Built-in event payloads per service
    asana/
    customerio/
    figma/
    gitlab/
    linear/
    netlify/
    trello/
    twilio/
    typeform/
fixtures/                       # Committed fixture files (per-hostname)
  acuityscheduling.com/
  api.customer.io/
  api.figma.com/
  api.netlify.com/
  api.trello.com/
  api.twilio.com/
  app.asana.com/
  events.twilio.com/
  gitlab.com/
```

## How `NODE_EXTRA_CA_CERTS` Works

`NODE_EXTRA_CA_CERTS` is a standard Node.js environment variable. It tells Node.js to trust additional CA certificates beyond the system defaults. When the proxy intercepts HTTPS traffic, it presents TLS certificates signed by its local CA. Setting this env var makes n8n trust those certificates.

- One-time setup: `npx n8n-node-mocker init`
- No system-wide changes, no `sudo`, no browser configuration
- Only affects the n8n process that sets the variable

## License

MIT
