# Testing Guide

Step-by-step instructions for testing each supported n8n trigger node
with n8n-node-mocker. Each section covers credential setup, node
configuration, and webhook firing.

## Prerequisites

Before testing any service, complete the one-time setup:

```bash
# 1. Build the mocker
cd n8n-node-mocker
pnpm install && pnpm build

# 2. Generate CA certificate (once)
npx n8n-node-mocker init

# 3. Start the proxy (Terminal 1)
npx n8n-node-mocker start

# 4. Start n8n through the proxy (Terminal 2)
cd /path/to/n8n
pnpm build  # if not built yet
NODE_EXTRA_CA_CERTS=~/.n8n-node-mocker/ca.pem \
HTTPS_PROXY=http://127.0.0.1:9090 \
NO_PROXY=telemetry.n8n.io,ph.n8n.io \
pnpm start
```

**All credential fields** (API keys, tokens, secrets) should use `test`
as the value unless noted otherwise.

---

## Acuity Scheduling

**Credential type:** Acuity Scheduling API

| Field | Value |
|-------|-------|
| User ID | `test` |
| API Key | `test` |

**Node configuration:**
1. Search for **Acuity Scheduling** and pick **On appointment scheduled** from the trigger list
2. Select your credential
3. Leave **Resolve Data** enabled (the proxy has a fixture for appointment details)
4. Click **Listen for test event**

**Fire the webhook (Terminal 3):**
```bash
npx n8n-node-mocker webhook fire \
  --service acuityscheduling \
  --url http://localhost:5678/webhook-test/<id>/webhook \
  --event appointment.scheduled
```

**What happens behind the scenes:**
- n8n calls `POST /webhooks` to register -- proxy returns a mock webhook ID
- n8n calls `GET /api/v1/appointments/<id>` to resolve appointment data --
  the proxy serves a realistic fixture via parent-path matching

**Available events:** `appointment.scheduled`, `appointment.changed`,
`appointment.rescheduled`, `appointment.canceled`, `order.completed`

---

## Asana

**Credential type:** Asana API

| Field | Value |
|-------|-------|
| Access Token | `test` |

**Node configuration:**
1. Search for **Asana** and pick **On task changed** from the trigger list
2. Select your credential
3. **Workspace Name or ID** -- select **Mock Workspace** from the dropdown
   (the proxy serves a fixture for this)
4. Click **Listen for test event**

**Fire the webhook (Terminal 3):**
```bash
npx n8n-node-mocker webhook fire \
  --service asana \
  --url http://localhost:5678/webhook-test/<id>/webhook \
  --event task.changed
```

**What happens behind the scenes:**
- n8n calls `GET /api/1.0/workspaces` -- proxy serves a fixture with a mock
  workspace (prevents pagination loops)
- n8n calls `GET /api/1.0/webhooks` -- proxy serves an empty list
- n8n calls `POST /api/1.0/webhooks` with the webhook URL in the body --
  proxy returns a mock ID **and** fires an `X-Hook-Secret` handshake back
  to n8n's webhook URL (this is the Asana-specific callback)
- n8n stores the `X-Hook-Secret` for future HMAC-SHA256 verification
- `webhook fire` uses the same secret from config to sign events

**Gotchas:**
- The workspace dropdown requires a fixture. Without it, Asana's pagination
  envelope (`{data: [], next_page: null}`) causes the smart fallback to loop.
- The `X-Hook-Secret` handshake happens automatically via service hook --
  no manual steps needed.

**Available events:** `task.changed`, `task.added`

---

## Customer.io

**Credential type:** Customer.io API

| Field | Value |
|-------|-------|
| Tracking API Key | `test` |
| Region | **Global region** |
| Tracking Site ID | `test` |
| App API Key | `test` |
| Webhook Signing Key | `test` |

**Node configuration:**
1. Search for **Customer.io** and pick **On email sent** from the trigger list
2. Select your credential
3. **Events** -- select **Email Sent** (or any events you want)
4. Click **Listen for test event**

**Fire the webhook (Terminal 3):**
```bash
npx n8n-node-mocker webhook fire \
  --service customerio \
  --url http://localhost:5678/webhook-test/<id>/webhook \
  --event email.sent
```

**What happens behind the scenes:**
- n8n calls `GET api.customer.io/v1/reporting_webhooks` to check for existing
  webhooks -- proxy returns an empty list
- n8n calls `POST api.customer.io/v1/reporting_webhooks` to register --
  proxy returns a mock webhook ID
- `webhook fire` computes HMAC-SHA256 of `v0:<timestamp>:<body>` and sends
  the `x-cio-signature` and `x-cio-timestamp` headers

**Gotchas:**
- The App API Key (not Tracking API Key) is used for webhook management.
  Auth is via `Bearer` token in the header.
- Event names use dots in n8n (e.g. `email.sent`) but the API uses underscores
  (e.g. `email_sent`). The node converts automatically.

**Available events:** `email.sent`, `email.opened`, `customer.subscribed`

---

## Calendly

**Credential type:** Calendly API (using "API Key or Personal Access Token")

Calendly has two auth modes. The API key (no dots) uses the old v1 API without
signature verification. A **Personal Access Token** (contains dots, like a JWT)
uses the v2 API with HMAC-SHA256 signature verification. Use the Access Token
path for a full test with signing.

| Field | Value |
|-------|-------|
| API Key or Personal Access Token | `test.test.test` |

> **Why `test.test.test`?** The Calendly credential detects the auth type by
> checking whether the key contains dots. A value with dots triggers the
> Access Token (v2 API) flow, which includes webhook signature verification.

**Node configuration:**
1. Search for **Calendly** and pick **Calendly Trigger** from the trigger list
2. Select your credential
3. **Scope** -- leave as **User** (default)
4. **Events** -- select **Event Created**
5. Click **Listen for test event**

**Fire the webhook (Terminal 3):**
```bash
npx n8n-node-mocker webhook fire \
  --service calendly \
  --url http://localhost:5678/webhook-test/<id>/webhook \
  --event invitee.created
```

**What happens behind the scenes:**
- n8n credential test calls `GET calendly.com/api/v1/users/me` -- proxy serves
  a fixture (the credential test always uses the v1 endpoint)
- n8n calls `GET api.calendly.com/users/me` to get user and org URIs -- proxy
  serves a fixture with mock user/organization
- n8n calls `GET api.calendly.com/webhook_subscriptions` to check for existing
  webhooks -- proxy returns an empty collection
- n8n calls `POST api.calendly.com/webhook_subscriptions` with a randomly
  generated `signing_key` in the body -- proxy returns a mock webhook **and**
  captures the `signing_key` to `~/.n8n-node-mocker/calendly-signing-key.txt`
- `webhook fire` auto-detects the captured signing key and uses it to compute
  the `Calendly-Webhook-Signature: t=<timestamp>,v1=<hmac-sha256-hex>` header

**Gotchas:**
- Calendly uses a **dynamic signing key** generated by n8n (similar to GitLab,
  Figma, Netlify). The proxy captures it automatically via service hook.
- The signature format is `t=<unix-timestamp>,v1=<hex>`, where the HMAC is
  computed over `<timestamp>.<raw-body>`.
- If you use an API key without dots (e.g. plain `test`), n8n uses the old
  v1 API (`calendly.com/api/v1/hooks`) and **skips signature verification**
  entirely -- use `test.test.test` for the full signing flow.
- Calendly has two hosts: `calendly.com` (v1 API + credential test) and
  `api.calendly.com` (v2 API). The proxy has fixtures for both.

**Available events:** `invitee.created`, `invitee.canceled`

---

## Figma

**Credential type:** Figma API

| Field | Value |
|-------|-------|
| Access Token | `test` |

**Node configuration:**
1. Search for **Figma** and pick **On file update** from the trigger list
2. Select your credential
3. **Team ID** -- enter `12345`
4. Click **Listen for test event**

**Fire the webhook (Terminal 3):**
```bash
npx n8n-node-mocker webhook fire \
  --service figma \
  --url http://localhost:5678/webhook-test/<id>/webhook \
  --event file_update
```

**What happens behind the scenes:**
- n8n calls `GET /v2/teams/<teamId>/webhooks` -- proxy returns empty list
- n8n calls `POST /v2/webhooks` with a randomly generated `passcode` in
  the body -- proxy captures it to `~/.n8n-node-mocker/figma-passcode.txt`
- `webhook fire` auto-detects the captured passcode and uses it for signing
  (you'll see `Using captured figma secret from ...` in the output)

**Gotchas:**
- Figma uses a **dynamic passcode** generated by n8n, not the static config
  secret. The proxy captures it automatically, so `webhook fire` just works.
- If you restart n8n and re-register the webhook, a new passcode is captured.

**Available events:** `file_update`

---

## GitLab

**Credential type:** GitLab API

| Field | Value |
|-------|-------|
| GitLab Server | `https://gitlab.com` |
| Access Token | `test` |

**Node configuration:**
1. Search for **GitLab** and pick **On push** from the trigger list
2. Authentication: **Access Token**
3. Select your credential
4. **Repository Owner** -- enter `janedoe`
5. **Repository Name** -- enter `mock-project`
6. Click **Listen for test event**

**Fire the webhook (Terminal 3):**
```bash
npx n8n-node-mocker webhook fire \
  --service gitlab \
  --url http://localhost:5678/webhook-test/<id>/webhook \
  --event push
```

**What happens behind the scenes:**
- n8n calls `POST /api/v4/projects/janedoe%2Fmock-project/hooks` with a
  randomly generated 64-char hex `token` in the body -- proxy returns a
  mock ID **and** captures the token to `~/.n8n-node-mocker/gitlab-token.txt`
- `webhook fire` auto-detects the captured token and uses it in the
  `X-Gitlab-Token` header

**Gotchas:**
- GitLab uses a **dynamic token** generated by n8n (similar to Figma).
  The proxy captures it automatically.
- The server URL in credentials determines which hostname the proxy
  intercepts. Use `https://gitlab.com` for the default fixtures to match.
  Self-hosted instances would need their own hostname-specific fixtures.

**Available events:** `push`, `issues`, `merge_requests`

---

## Netlify

**Credential type:** Netlify API

| Field | Value |
|-------|-------|
| Access Token | `test` |

**Node configuration:**
1. Search for **Netlify** and pick **On deploy created** from the trigger list
2. Select your credential
3. **Site Name or ID** -- select **mock-site** from the dropdown
   (the proxy serves a fixture for this)
4. Click **Listen for test event**

**Fire the webhook (Terminal 3):**
```bash
npx n8n-node-mocker webhook fire \
  --service netlify \
  --url http://localhost:5678/webhook-test/<id>/webhook \
  --event deploy_created
```

**What happens behind the scenes:**
- n8n calls `GET /api/v1/sites` -- proxy serves a fixture with a mock site
- n8n calls `GET /api/v1/hooks?site_id=...` -- proxy returns an empty list
- n8n calls `POST /api/v1/hooks` -- proxy returns a mock webhook ID
- `webhook fire` signs the payload as a JWT (HS256) with `iss: "netlify"`
  and a `sha256` of the body, sent in the `X-Webhook-Signature` header

**Gotchas:**
- Netlify uses **JWT signatures** (not HMAC). The signing secret in
  credentials is used as the JWT secret key.
- The JWS token contains `{ iss: "netlify", sha256: "<hex digest of body>" }`.

**Available events:** `deploy_created`, `deploy_building`, `deploy_failed`

---

## Trello

**Credential type:** Trello API

| Field | Value |
|-------|-------|
| API Key | `test` |
| API Token | `test` |
| OAuth Secret | `test` |

**Node configuration:**
1. Search for **Trello** and pick **Trello Trigger** from the trigger list
2. Select your credential
3. **Model ID** -- enter a board/card/list ID (e.g. `000000000000000000000b01`)
4. Click **Listen for test event**

**Fire the webhook (Terminal 3):**

Trello signs webhooks using the *registered* `callbackURL` (the production
webhook URL n8n sends to Trello). In test mode, the webhook listener is at
`/webhook-test/...`, but the registered callbackURL is `/webhook/...`. You
must pass `--webhook-url` with the production URL so the signature matches:

```bash
npx n8n-node-mocker webhook fire \
  --service trello \
  --url http://localhost:5678/webhook-test/<id>/webhook \
  --webhook-url http://localhost:5678/webhook/<id>/webhook \
  --event createCard
```

The `--url` is where the request is sent (the test listener). The
`--webhook-url` is the callbackURL used for signing (what n8n registered
with Trello). To get the production URL, replace `webhook-test` with
`webhook` in the test URL.

**What happens behind the scenes:**
- n8n credential test calls `GET /1/tokens/test/member` -- proxy serves a
  fixture via parent-path matching
- n8n calls `GET /1/tokens/test/webhooks` to check for existing webhooks --
  proxy returns an empty list
- n8n calls `POST /1/tokens/test/webhooks` with `callbackURL` and `idModel` --
  proxy returns a mock webhook with an `id`
- Trello normally sends a HEAD request to the callbackURL to verify it exists --
  n8n's `setup` webhook handler responds with 200 automatically
- `webhook fire` computes HMAC-SHA1 of `body + callbackURL` using the OAuth
  Secret, and sends it in the `x-trello-webhook` header

**Gotchas:**
- Trello **does not let you filter by event type** -- you subscribe to a model
  (board, card, list, member) and receive all actions on that model.
- The `OAuth Secret` is the application's secret from the Trello Power-Up
  admin page, **not** the API Key or Token.
- Trello uses a **unique signing scheme** where the body is concatenated
  with the callbackURL *before* HMAC-SHA1 hashing (prevents replay attacks
  between endpoints). The callbackURL is the *registered* URL, not the URL
  the request is sent to -- this is why `--webhook-url` is needed in test mode.
- The fixtures use `test` as the API Token value in the URL path
  (e.g. `/1/tokens/test/webhooks`). If you change the token value in
  credentials, you'll need matching fixtures.

**Available events:** `createCard`, `updateCard`, `addMemberToCard`

---

## Twilio

**Credential type:** Twilio API

| Field | Value |
|-------|-------|
| Auth Type | **Auth Token** |
| Account SID | `AC00000000000000000000000000000000` |
| Auth Token | `test` |

**Node configuration:**
1. Search for **Twilio** and pick **New SMS** from the trigger list
2. Select your credential
3. Click **Listen for test event**

**Fire the webhook (Terminal 3):**
```bash
npx n8n-node-mocker webhook fire \
  --service twilio \
  --url http://localhost:5678/webhook-test/<id>/webhook \
  --event sms.received
```

**What happens behind the scenes:**
- n8n credential test calls `GET /2010-04-01/Accounts/<accountSid>.json` --
  proxy serves a fixture via parent-path matching
- n8n calls `GET events.twilio.com/v1/Sinks` -- proxy returns an empty list
  (checkExists returns false)
- n8n calls `POST events.twilio.com/v1/Sinks` -- proxy returns a mock sink ID
- n8n calls `POST events.twilio.com/v1/Subscriptions` -- proxy returns a mock
  subscription ID
- `webhook fire` computes SHA-256 of the body, appends it as `?bodySHA256=<hash>`
  to the webhook URL, then HMAC-SHA1 signs the full URL with the auth token
- n8n verifies the `bodySHA256` query param matches the body hash, then verifies
  the `x-twilio-signature` header

**Gotchas:**
- Twilio uses a **unique signing scheme** compared to other services. Instead
  of signing the body, it appends the body's SHA-256 hash as a URL query param
  (`?bodySHA256=...`), then HMAC-SHA1 signs the full URL.
- The `Auth Token` in credentials is used as the signing secret.
- The `Account SID` must look like a valid Twilio SID (starting with `AC`)
  for the credential test fixture to match.
- If you use **API Key** auth type instead of **Auth Token**, signature
  verification is skipped entirely (n8n falls back to allow all requests).

**Available events:** `sms.received`, `call.complete`

---

## Linear

**Credential type:** Linear API

| Field | Value |
|-------|-------|
| API Key | `test` |
| Signing Secret | `test` |

**Node configuration:**
1. Search for **Linear** and pick **On issue created** from the trigger list
2. Select your credential
3. **Team Name or ID** -- select **Mock Team** from the dropdown
   (the proxy serves a GraphQL fixture for this)
4. **Listen to Resources** -- select **Issue**
5. Activate the workflow (Linear uses active webhooks, not test mode)

**Fire the webhook (Terminal 3):**
```bash
npx n8n-node-mocker webhook fire \
  --service linear \
  --url http://localhost:5678/webhook/<id> \
  --event issue.created
```

**What happens behind the scenes:**
- n8n calls `POST api.linear.app/graphql` with `query Teams { ... }` -- proxy
  serves a fixture with a mock team (enables the dropdown)
- n8n calls `POST api.linear.app/graphql` with an unnamed `webhooks` query --
  proxy serves a generic `POST.json` fallback with an empty webhooks list
- n8n calls `POST api.linear.app/graphql` with `mutation webhookCreate` --
  proxy returns a mock webhook ID

**Gotchas:**
- Linear uses **active webhook URLs** (not test URLs). The URL format is
  `/webhook/<id>`, not `/webhook-test/<id>/webhook`.
- The signing secret in credentials must match the mocker config (`test`).
- Linear's signer injects a `webhookTimestamp` into the body automatically.
- Linear uses **GraphQL** for all API calls. Named operations get matched by
  operation name (e.g. `Teams.json`), unnamed queries fall back to `POST.json`.

**Available events:** `issue.created`, `issue.updated`, `comment.created`

---

## Typeform

**Credential type:** Typeform API

| Field | Value |
|-------|-------|
| Access Token | `test` |

**Node configuration:**
1. Search for **Typeform** and pick **On form response** from the trigger list
2. Select your credential
3. **Form** -- select any form from the dropdown (proxy returns a mock list)
4. Click **Listen for test event**

**Fire the webhook (Terminal 3):**
```bash
npx n8n-node-mocker webhook fire \
  --service typeform \
  --url http://localhost:5678/webhook-test/<id>/webhook \
  --event form_response
```

**Gotchas:**
- Typeform's signature uses `sha256=` prefix + base64 encoding.

**Available events:** `form_response`

---

## General Pattern for Other Services

For services not listed above, follow this pattern:

1. **Create credentials** with `test` in all fields
2. **Add the trigger node** and fill in required fields with any value
3. **Check proxy logs** for `FALLBACK` lines to see if fixtures are needed
4. **Click "Listen for test event"** or activate the workflow
5. **Copy the webhook URL** from the n8n UI
6. **Fire:**
   ```bash
   npx n8n-node-mocker webhook fire \
     --service <service-name> \
     --url <webhook-url> \
     --event <event-name>
   ```

To see available services and events:
```bash
npx n8n-node-mocker webhook list-services
npx n8n-node-mocker webhook list-events --service <name>
```

---

## Verifying Signature Rejection

To confirm that n8n properly rejects webhooks with wrong signatures,
fire an event with a bad secret:

```bash
npx n8n-node-mocker webhook fire \
  --service <service> \
  --url <webhook-url> \
  --event <event> \
  --payload '{"test": true}'
```

Then temporarily change the signing secret in `config.yaml` to a wrong
value (e.g. `wrong-secret`), restart the proxy, and fire again. You
should see `401 Unauthorized` in the output.

**For services with dynamic secrets** (GitLab, Figma): delete the
captured secret file and provide a wrong secret manually:

```bash
# Delete the auto-captured secret
rm ~/.n8n-node-mocker/gitlab-token.txt

# Fire with a wrong secret -- should get 401
npx n8n-node-mocker webhook fire \
  --service gitlab \
  --url <webhook-url> \
  --event push \
  --payload '{"object_kind": "push"}'
```

---

## Troubleshooting

**n8n is extremely slow after starting with the proxy:**
- Make sure `NO_PROXY=telemetry.n8n.io,ph.n8n.io` is set
- Use `127.0.0.1` not `localhost` in `HTTPS_PROXY`

**Dropdown fields are empty:**
- Check the proxy logs for `FALLBACK` lines on the API call
- The API may use a pagination envelope that doesn't work with the smart
  fallback -- add a fixture (see Asana workspace fixture as example)

**"Data is not iterable" or similar errors:**
- Usually caused by query parameters in the URL preventing fixture matching
- The proxy strips query strings before fixture lookup, but check that the
  fixture directory name matches the path without query params

**Webhook returns 404:**
- Make sure you're using the correct URL from the n8n UI
- Test mode URLs look like `/webhook-test/<id>/webhook`
- Active/production URLs look like `/webhook/<id>`

**Webhook returns 401 Unauthorized:**
- For static secrets: ensure the credential in n8n and the mocker config
  both use `test`
- For dynamic secrets (Calendly, GitLab, Figma, Netlify): ensure the proxy
  captured the secret during webhook registration -- check for the capture log
  message
- For Twilio: ensure the `Auth Token` in n8n credentials matches the
  `signingSecret` in the mocker config (both should be `test`)
