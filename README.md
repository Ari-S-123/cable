# C.A.B.L.E

C.A.B.L.E is a consent-first care-coordination prototype built with Next.js 16, React 19, Convex, WorkOS AuthKit, ElevenLabs, Fireworks, CopilotKit, Daytona, Resend, optional Twilio SMS, and Braintrust. Its primary demonstration is deliberately narrow: an elder speaks and reviews in Hindi, then chooses whether caregivers and a verified provider may receive exact English disclosures.

This repository is synthetic-data-only. It is not a medical device, is not clinically validated, does not diagnose, does not recommend medication or treatment, does not override consent, does not create provider accounts, and never calls emergency services automatically. Do not enter real health information, real identities, or uncontrolled email/phone destinations.

## What is implemented

- Locale-prefixed `en-US` and `hi-IN` application routes with a warm, accessible elder and caregiver experience.
- A visibly synthetic browser-only demonstration containing three deterministic fictional scenarios.
- Hindi private input, Hindi fact confirmation and consent read-back, canonical English facts, and exact English caregiver/provider disclosures.
- Static versioned English/Hindi safety wrappers. Only allow-listed dynamic slots can be translated.
- Immutable care-event and action-proposal versions, version-bound consent, one-version caregiver approval, append-only audit chaining, policy-validation records, immutable notification payloads, and lease-based delivery jobs.
- Current WorkOS identity, organization, role, membership, care-circle, ownership, recipient, consent, approval, version, policy result, and kill-switch checks at protected server boundaries.
- WorkOS, ElevenLabs, Resend, and optional Twilio webhook verification over raw bodies, replay protection, monotonic delivery states, redacted responses, strict origin checks, private no-store responses, and bounded rate limiting.
- ElevenLabs signed browser sessions with captions, mute/resume, text fallback, no raw-audio storage, short-lived nonces, signed allow-listed voice tools, durable private turns, correlation replay protection, and retention cleanup.
- Fireworks structured extraction/translation adapters with strict Zod parsing, bounded retries, timeouts, and deterministic fallback adapters.
- Daytona validation with a five-minute ephemeral sandbox, all networking blocked, no credentials or direct identifiers, bounded output, validator hashes, and guaranteed cleanup attempts. Convex repeats the authoritative execution gate after the sandbox passes.
- Resend provider idempotency and conservative Twilio retry handling: ambiguous SMS transport outcomes become `delivery_unknown` and are never retried automatically.
- CopilotKit proposal-only caregiver assistance. It receives consent-filtered state and has no direct Resend or Twilio execution tool.
- A credential-free local Braintrust evaluation suite containing 240 examples across consent, safety, translation, hash, tenancy, injection, and delivery categories.

## Requirements

- Node.js 24.x
- Bun 1.3.14 (package manager only)
- A modern browser for the app and Playwright verification

Bun is never used as the application JavaScript runtime. TypeScript scripts run with `node --import tsx`; Next.js and Convex run under Node.js. The repository uses the TypeScript 7 native CLI for `typecheck` and TypeScript 6 as the programmatic API required by Next.js tooling.

## Local deterministic setup

```bash
cp .env.example .env.local
bun ci
bun run verify:env
bun run seed
bun run dev
```

Open `http://localhost:3000/en-US/demo` or `http://localhost:3000/hi-IN/demo`.

The default environment is deliberately safe:

```dotenv
INTEGRATION_MODE=deterministic
DEMO_MODE=true
EXTERNAL_ACTIONS_ENABLED=false
HINDI_CONSENT_TEMPLATE_APPROVED=false
```

Deterministic mode does not contact WorkOS, Convex, ElevenLabs, Fireworks, Daytona, Resend, Twilio, or Braintrust. The demo state lives only in the current browser tab and cannot appear in the live elder/caregiver workspace.

### Synthetic personas and destinations

- Asha Mehta: fictional elder; speaks and reviews in Hindi.
- Maya Mehta: fictional family caregiver; reviews exact English disclosures.
- Lakeview Cardiology / Lakeview Clinic: fictional provider desks.
- Deterministic email addresses must end in `.invalid`.
- Deterministic phone numbers must use the reserved `+155501xxxx` fixture range enforced by the seed mutation.

The demo does not accept arbitrary identities or destinations. `bun run seed` validates fixtures but does not write live data or contact a vendor.

## Architecture

The Next.js App Router owns locale routing, AuthKit entry/callback/logout routes, the live voice UI, CopilotKit, environment validation, security headers, and the isolated browser demo. `src/proxy.ts` combines locale routing and AuthKit protection using the current `config` matcher.

Convex is the durable workflow authority. Public queries return role- and consent-filtered view models. Public mutations discard client identity/role claims and rederive the WorkOS subject, active organization, local user, membership, role, care circle, ownership, and relevant policy bindings. Live model/UI code cannot send email or SMS directly.

The authoritative workflow is:

1. Store short-lived private conversation turns; never store raw audio.
2. Parse model output from `unknown` with strict Zod contracts.
3. Create or correct an immutable `careEventVersion` and verify every Hindi/English hash.
4. Confirm facts before creating a version-bound consent request.
5. Record consent only for a conservative exact yes/no phrase. Ambiguous responses remain pending.
6. Give caregivers only the exact English disclosure covered by current consent.
7. Create an immutable action version whose provider body is copied from the consent-bound English snapshot.
8. Record caregiver approval for exactly one action version and payload hash.
9. Rebuild a credential-free policy envelope from current database state and validate it locally or in Daytona.
10. Recheck everything in one Convex transaction, reserve the idempotency key, create the immutable notification, and create an outbox job.
11. Lease one job, recheck consent/approval/version/contact/kill switches immediately before I/O, and call one provider.
12. Verify/deduplicate delivery webhooks and permit only monotonic status transitions.

Stable aggregates (`careEvents`, `actionProposals`) contain current state and version pointers. Immutable children (`careEventVersions`, `actionProposalVersions`) preserve the exact content, provenance, recipients, payloads, and hashes to which consent and approval were bound. Corrections supersede consent and invalidate unfinished proposals/approvals.

Canonical hashes normalize Unicode and line endings, sort object keys, omit `undefined`, normalize email and E.164 phone values, and compute `sha256("cable:v1:" + canonicalJson)`.

## Live configuration

Live mode fails closed when a required secret, approved destination, or template flag is missing. Start from `.env.example`, provision each vendor, then run:

```bash
INTEGRATION_MODE=live bun run verify:env
```

Never commit `.env.local`. Set the same secrets in Convex and Vercel where their server runtimes require them.

### WorkOS AuthKit

1. Create a WorkOS application and enable AuthKit.
2. Add `http://localhost:3000/callback` and the production `/callback` URL as redirect URIs.
3. Configure roles with exact slugs `elder` and `caregiver`.
4. Set `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD` (at least 32 characters), and `NEXT_PUBLIC_WORKOS_REDIRECT_URI`.
5. Configure the WorkOS membership webhook to `https://<convex-site>/webhooks/workos` and set `WORKOS_WEBHOOK_SECRET` in Convex.
6. Login, callback, and logout handlers are `/login`, `/callback`, and `/logout`.

Every protected Convex function reconciles the AuthKit JWT organization and role with the local membership. A forged client role or resource identifier is insufficient.

### Convex

```bash
bun run convex:dev
bun run convex:codegen
```

Set WorkOS and webhook secrets in the Convex deployment. Deploy `convex/schema.ts`, `convex/auth.config.ts`, `convex/http.ts`, and `convex/crons.ts`. Convex HTTP endpoints are:

- `/webhooks/workos`
- `/webhooks/elevenlabs`
- `/webhooks/resend`
- `/webhooks/twilio/message-status` (only when `TWILIO_ENABLED=true`)
- `/tools/elevenlabs/start_checkin`
- `/tools/elevenlabs/save_private_turn`
- `/tools/elevenlabs/extract_event_draft`
- `/tools/elevenlabs/confirm_event_facts`
- `/tools/elevenlabs/prepare_consent_prompt`
- `/tools/elevenlabs/record_consent_response`
- `/tools/elevenlabs/revoke_consent`
- `/tools/elevenlabs/get_workflow_status`
- `/tools/elevenlabs/transfer_to_caregiver`
- `/tools/elevenlabs/end_checkin`

The outbox worker runs every minute and is also scheduled immediately when work is queued. The maintenance cron runs every 15 minutes to expire consent, cancel unfinished work, remove expired private turns/session nonces/rate buckets, trim webhook replay receipts, and recover only provably safe email leases.

For a live Resend-only deployment, add these variables to the Convex development deployment with `bunx convex env set NAME value`:

- `WORKOS_CLIENT_ID`
- `WORKOS_WEBHOOK_SECRET`
- `INTEGRATION_MODE=live`
- `EXTERNAL_ACTIONS_ENABLED=true` when you are ready to permit sends
- `HINDI_CONSENT_TEMPLATE_APPROVED=true` only after the static Hindi wording is approved
- `TWILIO_ENABLED=false`
- `ELEVENLABS_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `RESEND_FROM_ADDRESS`
- `APPROVED_PROVIDER_EMAILS` as a comma-delimited exact allow-list
- `DAYTONA_API_KEY`
- `DAYTONA_API_URL` only when using a non-default Daytona API endpoint
- `AUDIT_HASH_SECRET`, generated as at least 32 random bytes

`CONVEX_SITE_URL` is supplied automatically by Convex. Do not manually set it. `NEXT_PUBLIC_CONVEX_URL`, WorkOS cookie/API credentials, Fireworks, browser ElevenLabs, and Braintrust variables belong in `.env.local`/Vercel rather than the Convex function environment.

### ElevenLabs

1. Create private English and Hindi multilingual agent presets with language detection and Hindi support.
2. Set `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, and `ELEVENLABS_WEBHOOK_SECRET`.
3. Configure post-call webhooks and every allow-listed server tool above using the Convex site URL.
4. Pass `session_nonce`, `conversation_id`, and a unique `correlation_id` in every tool call. `save_private_turn` also passes bounded `text` and `locale`.
5. Configure the exact server-side HMAC header format used by the webhook endpoint.

The browser receives only a short-lived signed URL and nonce. It never receives the API key. Raw audio is disabled; private turns expire within 24 hours and are shortened after completion.

### Fireworks

Set `FIREWORKS_API_KEY` and `FIREWORKS_MODEL_ID`. The default example uses the GLM 5.2 baseline. Fireworks is used only for extraction, clarification, action candidates, provider drafting, and allow-listed dynamic Hindi/English slots. All results are strict Zod objects; invalid, oversized, timed-out, or prohibited clinical output fails closed to a manual/deterministic path.

### Daytona

Set `DAYTONA_API_KEY` and optionally `DAYTONA_API_URL`. The validator sends no names, email addresses, phone numbers, transcript, message text, API keys, secrets, or tokens to Daytona. It uploads only an 8 KiB-bounded opaque policy envelope and versioned validator source to an ephemeral, private, network-blocked sandbox with a five-minute TTL.

### Resend

1. Verify the sending domain and set `RESEND_API_KEY` and `RESEND_FROM_ADDRESS`.
2. Configure delivery webhooks at `https://<convex-site>/webhooks/resend`.
3. Set `RESEND_WEBHOOK_SECRET` in Convex.

C.A.B.L.E passes its bounded idempotency key to Resend. Only proven pre-acceptance email failures are automatically retried.

### Twilio

Twilio is optional. To run email-only, set `TWILIO_ENABLED=false` in both `.env.local` and Convex, leave all `TWILIO_*` values and `APPROVED_PROVIDER_PHONES` empty, and create email provider contacts only.

To enable SMS later, set `TWILIO_ENABLED=true`, provision a controlled sender, set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, and `APPROVED_PROVIDER_PHONES` in both required runtimes. The worker automatically supplies `https://<convex-site>/webhooks/twilio/message-status` as the status callback.

Twilio transport timeouts are ambiguous. C.A.B.L.E records `delivery_unknown`, prevents an automatic duplicate SMS, and requires manual review.

### Approved provider destinations

`APPROVED_PROVIDER_EMAILS` is a comma-delimited live allow-list. `APPROVED_PROVIDER_PHONES` is required only when Twilio is enabled. A caregiver also needs `canManageProviderContacts`; a contact must be active and independently verified for the selected channel. Public queries return masked destinations. Disabling a contact blocks the execution recheck immediately.

### Hindi consent approval

Live Hindi consent and external sending remain disabled until the static wrapper has been reviewed outside this repository and the deployed version is explicitly approved:

```dotenv
HINDI_CONSENT_TEMPLATE_APPROVED=true
```

That flag does not approve model-translated safety language. Static wrappers are never automatically translated; only the declared dynamic slots are.

### Braintrust

Set `BRAINTRUST_API_KEY` and `BRAINTRUST_PROJECT_NAME`, then run `bun run eval`. Local evaluation uses `bun run eval:local` and sends no logs. Live spans must be redacted: store opaque IDs, hashes, rule codes, latency, and token counts—not health text, transcripts, destinations, credentials, or raw vendor bodies.

### Vercel

Import the repository, keep Bun as the install package manager, select Node.js 24, add the validated environment variables, and deploy. `vercel.json` uses `bun ci` and `bun run build`. Run live smoke tests against a preview before enabling the global and care-circle external-action switches.

## Runtime controls

The controls are intentionally independent:

- `INTEGRATION_MODE=deterministic|live` selects synthetic or vendor adapters.
- `DEMO_MODE=true|false` controls whether the isolated browser demo is available.
- `EXTERNAL_ACTIONS_ENABLED=true|false` is the global side-effect kill switch.
- `TWILIO_ENABLED=true|false` independently enables or removes live SMS.
- Each care circle has a separate `externalActionsEnabled` switch.
- `HINDI_CONSENT_TEMPLATE_APPROVED=true|false` gates live Hindi grants and sends.

For a provider message to execute, all five relevant controls and bindings must still pass at queue time and immediately before provider I/O.

## Commands

```bash
bun run dev              # Next.js development server
bun run build            # production build
bun run start            # production server
bun run typecheck        # TypeScript native CLI
bun run lint             # eslint . && prettier --check .
bun run format           # prettier --write .
bun run test             # compact local Vitest suite
bun run test:unit        # unit subset (optional for current milestone)
bun run test:integration # integration subset (optional for current milestone)
bun run test:e2e         # desktop and mobile workflow scenarios
bun run test:a11y        # Playwright/axe accessibility subset
bun run eval:local       # 240 deterministic no-send evaluations
bun run eval             # configured Braintrust experiment
bun run convex:dev       # local Convex deployment
bun run convex:codegen   # refresh generated Convex types
bun run seed             # validate synthetic fixtures only
bun run verify:env       # fail-closed environment validation
bun run check            # local aggregate check
```

Install Playwright Chromium once before browser verification:

```bash
bunx playwright install chromium
```

## Verification

The complete local gate is:

```bash
bun ci
bun run typecheck
bun run lint
bun run test
bun run test:e2e
bun run test:a11y
bun run eval:local
bun pm scan
bun run build
```

Unit and integration suites are intentionally compact for the current milestone. The deterministic demo and policy evaluation are the primary credential-free acceptance paths.

Live credentials are not included and repository checks do not claim that external accounts are provisioned. After supplying credentials, manually smoke-test WorkOS/Convex membership reconciliation, ElevenLabs browser sessions, Fireworks inference, Daytona cleanup, Resend delivery/webhooks, Braintrust redaction, and a Vercel preview. Test Twilio accepted/unknown delivery handling only if SMS is enabled. Missing credentials mean those checks are unexecuted—not successful.

## Manual test checklist

1. Open both locale landing pages.
2. Complete the Hindi appointment demo, correct a fact, and confirm that the version changes.
3. Confirm the Hindi preview and exact English disclosure are shown together before consent.
4. Try an ambiguous response and a denial; ensure no caregiver/provider detail appears.
5. Grant consent, edit the caregiver action, and confirm the old approval disappears.
6. Approve, validate, revoke, and confirm delivery cannot be queued.
7. Complete a valid synthetic delivery and confirm only one accepted record appears.
8. Verify keyboard focus restoration, captions, reduced motion, high contrast, mobile layout, and 200% browser zoom.
9. In live mode, verify cross-tenant IDs, forged roles, invalid origins, unsigned/replayed webhooks, unverified contacts, stale hashes, expired consent, and disabled kill switches all fail generically.
10. Confirm no secret or raw health content is present in client bundles, logs, audit metadata, policy envelopes, or Braintrust spans.

## Safety and retention defaults

- Consent expires after at most 24 hours; corrections, translation changes, recipient changes, outbound-text changes, revocation, or expiry invalidate unfinished downstream work.
- One current caregiver approval is bound to one immutable action version and payload hash.
- Provider replies are disabled.
- Raw audio storage is disabled.
- Private turns are deleted after confirmation/completion or within 24 hours.
- External destinations are seeded/allow-listed only.
- Daytona fails closed.
- Lock-screen operational alerts are generic and attention-only; no care-event details are included.
- Immediate-safety phrases show a boundary message and direct the person to local emergency services; the product does not diagnose or call on their behalf.

External account creation, secret generation, DNS verification, controlled phone/email ownership, legal or clinical review, and vendor-dashboard configuration cannot be performed by repository code. They remain explicit deployment prerequisites.
