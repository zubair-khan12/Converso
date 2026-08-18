# Converso — Voice AI SaaS

Multi-tenant platform: a business signs up (self-serve, or provisioned by an
admin), builds a voice agent, gives it a knowledge base and tools, attaches
a phone number, and Vapi handles the actual calls. This file is a living
summary for whoever (human or Claude) picks up the project next — **update it
whenever architecture, stack, or scope changes**, don't let it drift stale.

## Repo layout

```
backend/    FastAPI API + sqladmin internal admin panel
frontend/   Next.js 16 app (marketing site, login, dashboard)
infra/      (empty — reserved for deploy config)
```

Each has its own `CLAUDE.md`/`AGENTS.md` for area-specific detail; this file
is the cross-cutting map. Two `.venv`s currently exist (repo root and
`backend/.venv`) — known, deliberately left alone for now, see backend notes.

## Stack

- **Backend**: FastAPI 0.139 + Uvicorn, plain SQLAlchemy 2.0 (`DeclarativeBase`),
  standalone Alembic, PostgreSQL 15 + pgvector, `sqladmin` for the internal
  admin panel, PyJWT for tokens, Werkzeug only for `check_password_hash`,
  `cryptography`/Fernet for encrypting tenant Vapi keys, `httpx` for the Vapi
  REST API. **RAG**: LangGraph for the agent; langchain-openai for embeddings
  (`text-embedding-3-small`, 1536, cheapest OpenAI embeddings) and generation
  (`gpt-4.1-nano`, cheapest chat model). pypdf for PDF text extraction. NOTE:
  `EMBEDDING_DIM` must match the embedding model and the `document_chunks`
  vector column (currently 1536).
- **Frontend**: Next.js 16.2 (App Router) + React 19, Tailwind v4, shadcn/ui
  built on **Base UI** primitives (not Radix — different API, e.g. `render`
  prop instead of `asChild`).
- Both are early-stage / pre-deploy. No CI, no staging, single local Postgres.

## Auth model

Two separate identities, deliberately not merged:

- **Admins** (`admin_users`, platform staff) sign in to `/admin` and see *every*
  tenant's data. Not tenant-scoped — a tenant `User` with `role="owner"` is
  never an admin, because owning Acme must not grant access to Beta Corp.
  Bootstrap the first one with `python create_admin.py`; after that add more from
  `/admin` → Tenancy → Admins. Sessions are 8h signed cookies and are re-checked
  against the DB per request, so deactivating revokes access immediately.
  Production requires `ENVIRONMENT=production` + a non-default `SECRET_KEY`
  (which signs that cookie) — the app refuses to start otherwise.
- **Tenant users** (`users`) sign in to the product. They arrive either by
  **self-signup** (`POST /api/auth/signup`, see below) or by being provisioned
  in `/admin`. Login:

1. Browser → Next.js Route Handler (`/api/auth/login`, same origin)
2. Route Handler → FastAPI `/api/auth/login` server-to-server
3. FastAPI returns a JWT; Next.js sets it as an **httpOnly, Secure-in-prod**
   cookie (`converso_session`) — never localStorage/sessionStorage, and the
   browser never sees the raw JWT.
4. Server components call `getCurrentUser()` (`frontend/lib/session.ts`),
   which verifies the cookie against `GET /api/auth/me` on every request.

`users.onboarded` (boolean) drives a one-time post-login tour: first login →
`/getting-started`, everyone else → `/dashboard` directly. Set via
`POST /api/auth/onboarded`, idempotent, never flips back. **Only self-signups
ever see it** — the tour explains setting a workspace up from nothing, which
isn't the situation of someone handed a configured account, so both the admin
panel and `manage.py create-user` create users with `onboarded=True`.

## Signup + account status

Self-signup (`POST /api/auth/signup`, `SIGNUP_ENABLED` to close it again
without a deploy) takes **organization, name, email, password** and creates a
**new `Tenant` plus its `owner`** in one transaction. It never joins an
existing tenant: organisation names aren't unique or verified, so matching on
one would let anybody request their way into someone else's workspace. Growing
a tenant to a second user is what invites are for — not built yet. `tenants.slug`
is derived from the org name and uniquified (`acme`, `acme-2`); `users.email`
is **globally** unique, so one person cannot be in two tenants.

The tenant is the **billing/access boundary** — money is collected outside the
system, so `tenants.status` (`active` | `disabled`) is what staff flip when a
customer doesn't pay. Kept separate from `users.is_active`, which means "does
this person still work here?" — offboarding an employee and suspending a
customer must not be the same lever. `trial_ends_at` is unused by default;
when set, the gate treats the account as expired past it, so turning signups
into time-limited trials needs no new enforcement code. `tenants.source`
(`signup` | `admin`) is what makes self-signups identifiable in `/admin`.

Three things worth not regressing:

- **The gate lives inside `deps.get_current_claims`**, the dependency every
  product router already goes through — not at each call site, because a gate
  you have to remember to add is one that will eventually be missing from
  exactly one endpoint. It 403s with `{"code": "account_disabled"}`.
  `get_token_claims` is the identity-only variant used by `/me`.
- **A locked user can still sign in.** `/me` deliberately keeps working and
  carries `account_enabled` + `account_locked_reason`, so the dashboard layout
  renders `AccountLocked` explaining the situation. Failing the login instead
  would tell a paying-late customer "invalid email or password", and they'd
  conclude the product is broken rather than getting in touch.
- **Disabling also detaches their Vapi phone numbers**
  (`tenants.service.suspend_live_resources`, run from `TenantAdmin`). Gating
  the API isn't enough on its own: inbound calls are routed by *Vapi*, and a
  trained agent's every turn runs through our custom-LLM endpoint on the
  **platform** OpenAI key — a locked-out customer whose phone still answers is
  a bill we pay. Re-enabling re-attaches (`restore_live_resources`). The
  custom-LLM endpoint re-checks the tenant itself, since Vapi calls it with no
  JWT.

Because signup is open and **email is not verified**, two guardrails carry the
abuse risk: `MAX_DOCUMENTS_PER_TENANT` (embeddings are on the platform key)
and `SIGNUP_ENABLED`. Email verification is the obvious next hardening step.

New signups are emailed to `ADMIN_NOTIFY_EMAIL` via `app/core/notifications.py`
(SMTP today, one function to swap for Resend/Slack) as a **background task that
swallows every failure** — the `Tenant`/`User` rows are the record of a signup,
the email is only the nudge, so a mail outage must never 500 a customer's
signup. Unconfigured, it prints to the server console.

Tenant scoping: every tenant-owned table carries a non-nullable `tenant_id`
(`TenantScopedMixin` in `backend/app/base_model.py`). Tenant context always
comes from the authenticated JWT server-side — the frontend/client never
supplies `tenant_id` directly.

## Secrets / configuration

**Nothing sensitive has a working default in `backend/app/config.py`** — it's a
committed file, so a default that works is a secret that has leaked.
`SECRET_KEY`, `ENCRYPTION_KEY`, `DATABASE_URL` and `OPENAI_API_KEY` come from
the environment and default to empty. `validate_settings()` (called from
`main.py`) warns in development and **exits 1** in production, so a
half-configured instance never serves traffic. Frontend mirrors this:
`BACKEND_URL` throws in production rather than falling back to localhost.

There is deliberately **no platform-wide `VAPI_API_KEY`** (or Cal.com/Twilio/
Telnyx). Those are per-tenant, pasted in the dashboard and encrypted into
`integrations` — one shared key would put every tenant's calls on one account.

The `ENCRYPTION_KEY` currently in `backend/.env` is the one that was previously
committed in `da8f55c`, kept deliberately so existing encrypted credentials
still decrypt. Rotating it is a known follow-up before real customer data
lands — and rotating makes existing credentials undecryptable, so tenants must
reconnect their integrations when it happens.

## Backend conventions

- Domain modules under `app/<domain>/` (e.g. `auth`, `agents`, `knowledge`,
  `telephony`, `conversations`, `integrations`, `tenants`) — each with its own
  `models.py`; routers live alongside when a domain is wired up.
- `app/models.py` imports every domain's models so `configure_mappers()` /
  Alembic autogenerate see the full picture.
- Migrations are now **additive** — the backend is deployed, so the initial
  schema has already been applied somewhere that editing it wouldn't reach.
  (`aa97fec2a867` initial → `60846f81001d` admin users → `b1c4e7f20a15`
  tenant account status.) The old "squash into the initial migration" rule no
  longer applies.
- Run migrations from `backend/`: `alembic revision --autogenerate -m "..."`,
  `alembic upgrade head`, sanity-check with `alembic check`.
- Two venvs exist (root `.venv`, `backend/.venv`) — pick whichever has FastAPI
  installed for a given task; consolidating them is a deferred cleanup.
- **sqladmin forms exclude every one-to-many relationship** (`_form_excludes`
  in `app/admin/__init__.py`). sqladmin renders them as multi-selects, so
  saving a *parent* means "these are now its only children" — submitting the
  Tenant form issued `UPDATE agents SET tenant_id=NULL` for every agent, and
  only the NOT NULL constraint stopped it (which is why the page couldn't be
  saved at all). Ownership is set from the child side; the exclusion list is
  computed from the mapper so a new relationship can't reintroduce the hazard.

## Design system

The brand comes from the logo: **navy `#16233F` + gold `#E0A020`**, deepening
to `#B9770E`. The gold is deliberately darker than a pastel yellow — a light
yellow can't carry ink on top of it and reads washed-out on a screen.

Everything is a token in `app/globals.css` — accent tints (`--accent-soft`,
`--accent-softer`), semantic status colours (`--success*`, `--danger*`,
separate from the brand accent so a palette change can't make "failed" look
fine), neutrals, shadows, radii. **No component should spell out a raw
`rgba()` or hex**; that state is what made re-tuning the brand a hunt through
a dozen files. The shadcn tokens (`--primary`, `--ring`, …) are mapped onto
these, so `bg-primary` is the navy and the focus ring is the gold.

Type is **Inter** for UI/body (`--font-body`, wired to Tailwind's `font-sans`)
and **Plus Jakarta Sans** for headings (`--font-display`, `font-heading`);
`h1–h3` pick up the display face automatically, and `.page-title`/`.page-sub`
give every screen's header one rhythm.

Shared pieces worth reaching for before writing markup:

- `components/brand/logo.tsx` — `LogoMark` (vector, no image request) and
  `Logo` (mark + wordmark). `tone="light"` for dark grounds.
- `components/ui/status-pill.tsx` — one pill for agents, documents and phone
  numbers, keyed by semantic tone.
- `components/ui/textarea.tsx`, `native-select.tsx` — match `Input`; four
  screens previously each pasted their own `fieldClass` string.
- `Button` has a `brand` variant (the gold gradient) — don't paste the
  gradient onto a button. Control heights line up across `Input` and `Button`
  (sm 36 / default 40 / lg 44).

## Frontend conventions

- `frontend/AGENTS.md` (imported by `frontend/CLAUDE.md`) warns this Next.js
  version has breaking changes vs typical training data — `cookies()` is
  async, middleware is renamed `proxy.ts`, etc. **Read
  `node_modules/next/dist/docs/` before assuming an API.**
- Server-only session helpers live in `lib/session.ts` (never import from a
  client component); client-side API calls in `lib/api.ts` hit our own Route
  Handlers, never the FastAPI backend directly.
- shadcn components are Base UI, not Radix — check the local component source
  before assuming a prop like `asChild` exists.
- Brand palette/fonts and CSS-layer rules live in `app/globals.css` — generic
  resets are scoped to `@layer base` so Tailwind utilities always win.
- Landing page (`app/page.tsx`) is intentionally bespoke CSS modules, not
  Tailwind/shadcn — everything under `/dashboard` and `/login` uses
  Tailwind + shadcn. It sells **both channels**: hero → four shared building
  blocks → four ordered steps → a voice/chat pair (voice gets the one dark
  panel, chat shows the actual snippet) → FAQ → closing CTA. The step numbering
  is real sequence, not decoration — an agent can't be grounded before it
  exists or go live before it can answer.
- Product copy is **channel-neutral by default**. Anything that says "caller",
  "call" or "voice" should be true only where the voice path is genuinely
  what's meant; the onboarding tour in particular has to read sensibly for a
  signup who will only ever use the website chat.

## Chat agents

A chat agent is **the same `Agent` row** as a voice agent — `agents.kind` is
`voice` | `chat` — running the same LangGraph brain, the same knowledge base and
the same Cal.com tools. Only the transport differs, and that is the whole point:
a fix to retrieval or booking lands on both channels at once, and the Agents
screen is one list with a tab rather than two half-built sections.

What `kind="chat"` changes:

- **No Vapi side at all.** `push_to_vapi` returns early for a chat agent and
  marks it `ready` — the guard lives there, not at each call site, so no future
  caller can provision one by accident. It follows that chat agents need no Vapi
  key, so Agents and Knowledge Base are **no longer Vapi-gated**; only the voice
  tab says "connect Vapi first". `resync_tenant_agents` skips them for free,
  since it filters on `vapi_assistant_id`.
- **Turns arrive over HTTP** at `POST /api/chat/{agent_id}/messages`
  (`app/chat/`), JWT-gated like the rest of the product API. There is
  deliberately **no public/unauthenticated variant yet**: an open endpoint runs
  the *platform* OpenAI key for anyone who finds the URL, so a website widget
  needs a per-agent public token, per-domain CORS and rate limits first.
- **Cal.com works the same, with two exemptions.** Linking checks the agent is
  live on Vapi — meaningless for a chat agent, which has no assistant — so that
  guard is skipped for `kind="chat"`, and the Integrations screen is not
  Vapi-gated either. `app/calcom/prompt.py` generates a **chat wording** of the
  same steps: telling a chat agent to read an email back "out loud" and keep
  replies "spoken-friendly" produces stilted text, and a visitor can see their
  own typing.
- **A session is a `Conversation` with `channel="chat"`**, so transcripts, the
  tool trace and the dashboard stats work with no new plumbing. Consequences
  worth keeping: the Conversations screen (`/dashboard/call-logs`) is one screen
  with a **Calls / Chats tab** driven by `?channel=`, never one interleaved list
  — a chat row has no recording, duration or caller, so mixing them leaves every
  column half-empty. A chat also never hangs up, so `active` renders as "Open"
  rather than "In progress". Every call/minute rollup in
  `dashboard/router.py` is explicitly voice-only — otherwise opening the chat
  panel would inflate "total calls".
- **The chat UI is its own page** (`/chat/{agent_id}`, outside `/dashboard`, in
  the same tab): a chat is a sustained back-and-forth, and a modal over the
  agents list makes it feel disposable while hiding everything behind it. No
  sidebar, so the header carries an explicit back link; `/chat/:path*` is in the
  proxy matcher so an expired session bounces to login.

One trap that cost a debugging round: the graph's agent node prompts on
`state["messages"]` alone — `query` only drives retrieval — so **the current
user turn must be appended to the history** before `run_brain`, or the model
answers without ever seeing the question. The voice path gets this free because
Vapi's payload already ends with the caller's turn; `chat/service.py` has to do
it explicitly.

`Document.agent` uses `passive_deletes=True`: `documents.agent_id` is NOT NULL
with ON DELETE CASCADE, and without it SQLAlchemy tries to null the column
first, so deleting *any* agent that has a knowledge source failed.

## The website widget (the only public surface)

Any agent — voice or chat — can be embedded on the tenant's own site. Two
snippets, both built from one `agents.public_token`: a `<script>` that adds a
floating bubble (`frontend/public/widget.js`, dependency-free and touching
nothing on the host page), and an `<iframe>` for embedding inline. Both load
`/widget/{token}`, which renders `WidgetChat` or `WidgetVoice`.

This is the **one unauthenticated product surface**, and a widget turn spends
the *platform* OpenAI key, so an open endpoint is an open invoice. Three
independent guards, in `app/widget/`, each failing closed:

- **The token** is separate from the agent's UUID (it is published in page
  source, so leaking it must not expose an id used elsewhere) and is rotatable
  from the dashboard — the only real answer to a leak.
- **`agents.allowed_origins`** must be non-empty before the widget can be
  enabled: "live but unrestricted" must not be reachable by leaving a field
  blank. **Inside an iframe the browser reports *our* origin, not the embedding
  site's**, so the parent origin is forwarded as `X-Widget-Origin`, taken from
  the frame request's `Referer` (which page JS cannot forge) and falling back to
  the `?o=` the launcher adds.
- **Rate limits** are the real backstop, precisely because a non-browser client
  can send any origin it likes: 20 messages/minute per IP+token (in-process, so
  per-worker — Redis is the upgrade path) and a 500/day per-tenant cap counted
  from `messages`, so it survives a restart.

The public response deliberately omits the trace the dashboard shows — sources,
latency and tool timings are facts about the tenant's knowledge base, not
something to render on their customers' screens.

## Voice agents + the LangGraph brain (Vapi custom-LLM)

An agent lives in two places: a local `Agent` row and a Vapi assistant, kept in
sync by `app/agents/provisioning.py` (`push_to_vapi`, shared by the agents
router and the integrations router). Two model modes:

- **Plain**: Vapi runs its own built-in OpenAI model.
- **Brain on**: the assistant's `model.provider` is `custom-llm` pointed at
  `{PUBLIC_BACKEND_URL}/api/vapi/custom-llm/{agent_id}`, so Vapi routes **every
  turn** to our LangGraph agent (`app/vapi/rag_agent.py`) and we stream an
  OpenAI-compatible SSE reply. The agent id in the path is the capability token
  (never trusted from the request body).

`provisioning.brain_enabled()` decides which: the brain is on when the agent has
an embedded knowledge base (`config.rag_enabled`) *or* is the agent Cal.com is
linked to. Both are per-agent, but the Cal.com *credential* is per-tenant, so
connecting/linking/disconnecting re-pushes every one of that tenant's
already-provisioned assistants (`resync_tenant_agents`) — otherwise the tools
would exist server-side while Vapi kept using its own model, and re-linking
would leave the old agent still holding them.

The graph is `retrieve → agent ⇄ tools → END`:

- **Knowledge base (tool #1)** runs in its own up-front node, not as a model
  choice — a trained agent should answer every turn from its knowledge. Skipped
  entirely when `rag_enabled` is false, so a scheduling-only agent doesn't pay
  for an embedding call per turn.
- **Cal.com (tool #2)** is a real model-chosen tool loop, because booking is a
  deliberate multi-turn act.

**A live caller must never hear silence**, so the loop is contained at three
levels. `scheduling_tools.MAX_TOOL_CALLS_PER_TURN` is the real cap: past it the
tools refuse to run and tell the model to speak, which ends the loop *with an
answer*. `RECURSION_LIMIT` is only a backstop, and hitting it returns
`FALLBACK_ANSWER` rather than raising. Finally the custom-LLM endpoint catches
everything — it always returns valid SSE, because a 500 gives Vapi nothing to
say and the caller just hears dead air.

Cal.com is armed for exactly **one agent per tenant**, so a tenant can paste the
scheduling prompt into an agent that has no tools — and the model then *claims*
a booking that never happened, which is worse than refusing: the customer blocks
out time for a meeting nobody scheduled. `NO_SCHEDULING_SECTION` is the
counterweight: when the base prompt mentions booking and `calcom` is None, the
brain tells the model plainly that it cannot book. It applies to both channels.

Two things that made a small model (`gpt-4.1-nano`) loop, both fixed and worth
not regressing: tool output that told it to "look again" (tools now report
facts and hand the turn back to the caller), and offering the *first* N slots —
a 15-minute event type yields ~30 slots/day, so that meant 9:00, 9:15, 9:30…
`_offerable`/`_spread` now spread picks across days and across a day. If a
model still loops, `RAG_LLM_MODEL` in `.env` is the dial (nano → mini).

Tools are built **per turn** (`app/vapi/scheduling_tools.py`) since they close
over the calling tenant's credentials, so only the tool-free graph is compiled
at import.

Knowledge flow: add sources (pasted text / PDF·txt, `POST .../documents/*`,
stored as `pending` with `extracted_text`) → **Train agent** (`POST
.../train`) chunks + embeds into pgvector and flips the assistant to custom-LLM.
Each retrieval is traced to the **backend console** and persisted
(`Conversation` upserted by Vapi `call.id` + `ToolExecution`
`knowledge_base_search`) — the learning-visibility feature.

**Local-dev requirements for live calls**: `OPENAI_API_KEY` (platform,
embeddings + generation) and `PUBLIC_BACKEND_URL` set to an **ngrok** tunnel —
Vapi can't reach `localhost`. Without the key, training fails gracefully
(per-doc `failed` status) and non-RAG flows still work. See memory
`rag-langgraph-architecture`.

## Cal.com scheduling (agentic tool #2)

Setup is three steps on **Integrations** (`components/dashboard/calcom-panel.tsx`):
paste a Cal.com API key → link **one agent** to an event type → copy the
generated prompt into that agent's base prompt. Then call it and ask to book.

- `POST /api/integrations/calcom` validates the key against `GET /v2/me` (which
  also yields the account's **timezone** and organizer email — the agent speaks
  in that timezone and never asks the caller for theirs) and caches the event
  types. Stored in the same encrypted-`Integration` pattern as the Vapi key.
  Cal.com's own error text is passed straight through on failure. **Gotcha:**
  Cal.com API keys **expire after 30 days** unless "Never expires" is ticked,
  and an expired key is rejected in their rate-limit guard *before auth runs* —
  `CustomThrottlerGuard - Invalid API Key`, identical to a mistyped, truncated,
  or self-hosted key. `_calcom_key_hint` appends that explanation to any
  401/403, because nobody guesses expiry from the message.
- `PATCH` links an event type to one agent (`config.agent_id` + `event_type_id`).
  **That pair is what arms scheduling** — with either missing,
  `integrations.service.get_calcom_config(db, tenant_id, agent_id)` returns
  `None`, which every caller reads as "scheduling is off for this agent".
  The key is connected once per tenant but only the linked agent gets the tools,
  so a support line doesn't start offering meetings. Re-linking still re-pushes
  the whole tenant, to strip the tools from the previous holder.
- `scheduling_prompt` is generated server-side (`app/calcom/prompt.py`) with the
  event name, duration and timezone already baked in, so there's nothing for the
  tenant to fill in — it names `find_available_slots` / `book_meeting`, so the
  two must stay in sync with the tool names in `scheduling_tools.py`.

Cal.com versions each endpoint group separately via a `cal-api-version` header
(`/me` none, `/event-types` 2024-06-14, `/slots` 2024-09-04, `/bookings`
2024-08-13) — the wrong one is a 400, so `app/calcom/client.py` keeps them
per-group, not global.

The model never sees a raw date: `SCHEDULING_SECTION` tells it today's date so
it can turn "next Tuesday" into a `YYYY-MM-DD` for `find_available_slots`, and
slot results carry both a speakable label and the exact `start_time` string to
hand back to `book_meeting`. Every tool call is console-traced and persisted as
a `ToolExecution` (`calcom_find_slots` / `calcom_book_meeting`) next to the RAG
trace. **Inbound scheduling only** — no rescheduling or cancelling.

## Call logs + dashboard stats

Every assistant carries `server.url =
{PUBLIC_BACKEND_URL}/api/vapi/webhook/{agent_id}` and subscribes to exactly two
`serverMessages`: `status-update` and `end-of-call-report` (`SERVER_MESSAGES` in
`app/vapi/client.py`). Like the custom-LLM endpoint, the agent UUID in the path
is the capability token — Vapi sends no JWT — and the endpoint always answers
200 unless the agent is unknown, because a 5xx just makes Vapi retry.

`app/conversations/service.py` owns the writes. Everything is an **upsert keyed
on (tenant_id, vapi_call_id)** and only fills fields it actually has, because
the pieces arrive out of order: a custom-LLM turn can create the row before the
first status-update, and a resent report may carry no timing at all. Hence two
rules worth keeping: a finished call never walks back to `active`, and the
timestamp-derived duration only fills a gap — Vapi's own `durationSeconds`
wins, and neither overwrites a duration already stored. `_sync_messages`
rewrites the turn-by-turn `messages` from the report (authoritative, arrives
once), translating Vapi's `bot` role to our `assistant`.

Untrained agents produce call logs too — this is the only persistence path that
doesn't depend on RAG. Rows created *before* this webhook existed have no
timing and stay `active` forever; they're harmless but read as "In progress".

`artifactPlan.recordingEnabled` is set explicitly (not left to Vapi's default)
because the Call Logs screen plays `recordingUrl` back — playback silently
disappearing because of an account setting would be worse than a loud failure.

Two read surfaces:

- `GET /api/dashboard/summary` (`app/dashboard/router.py`) — one round-trip for
  the whole dashboard home: agent/number/document counts, call and minute
  totals (total + this month), unique callers, average duration, spend, and the
  five most recent calls. `getDashboardSummary()` returns **null** when the
  backend is unreachable, which the UI must render differently from a real
  zero — `—`, not `0`.
- `GET /api/conversations` + `/{id}` (`app/conversations/router.py`) — the Call
  Logs screen. The list deliberately omits transcript/summary/messages (a few
  hundred full transcripts is a slow page for text nobody asked to read) but
  *does* carry `recording_url`, so a row plays inline with no extra request.
  Detail is fetched once per row when it's expanded, via the
  `/api/conversations/[id]` Route Handler.

Recordings are served straight from Vapi's URL — we don't proxy or re-host
them, and nothing about a call is stored as a file on our side.

## Phone numbers (inbound calls)

A `PhoneNumber` row mirrors `Agent`'s two-places-kept-in-sync pattern: every
number — regardless of underlying carrier — is created/updated/deleted
through **Vapi's own** `/phone-number` API (`app/vapi/client.py`'s
`create_phone_number`/`update_phone_number`/`delete_phone_number`), never a
carrier's API directly. `provider` picks the carrier:

- **`vapi`** (default) — Vapi provisions the number itself, no external
  account; `numberDesiredAreaCode` is an optional hint.
- **`twilio`** — bring-your-own: buy the number in Twilio, connect the
  account's SID + Auth Token once (`POST /api/integrations/twilio`, same
  encrypted-`Integration` pattern as the Vapi key), then import the number
  (`POST /api/telephony/numbers`). Vapi accepts these credentials **inline**
  on the create call (confirmed via Vapi's OpenAPI spec) — no separate Vapi
  credential object needed.
- **`telnyx`** — bring-your-own, but its `credentialId` is **not** anything
  from Telnyx's own dashboard: it's the UUID of a Credential the tenant must
  manually add at **dashboard.vapi.ai/keys** (pasting their Telnyx API key
  there — Vapi has no public API to create credentials, confirmed empty in
  the spec). We just store that UUID (validated as UUID-shaped before saving)
  and pass it through as `credentialId`.

Neither BYO provider has a search/purchase UI — attach an existing number only.

Attaching a number sets its Vapi `assistantId`; any inbound call to that
number is routed to that agent exactly like a web test call, just from a real
caller. **Inbound only** — outbound dialing isn't built. `e164` is nullable
(Vapi assigns the actual number for `provider="vapi"`, so it's briefly
unknown at `pending`). `PROVISIONING_STATUSES`/`provisioning_error` mirror
`Agent`'s pattern, with the same `POST /{id}/retry`.

A genuine Pakistani (+92) number is very unlikely to be self-serve through
any of these platforms (PTA regulation typically requires a licensed local
carrier) — not attempted; the provider layer is pluggable if one is found.

## Current scope / state

Done: landing page, login (httpOnly cookie), self-signup + tenant account
status (disable/re-enable from `/admin`, locked-account screen), first-login
onboarding tour,
dashboard shell, dashboard home (live counts from `GET
/api/dashboard/summary` + recent calls), call logging from Vapi's server
webhook, Conversations (calls + chats, recording playback, transcript, tool trace),
Configure Vapi (key
encrypted at rest), Voice agents CRUD synced to Vapi + web test calls,
Knowledge Base (text/PDF upload, LangGraph RAG via custom-LLM, console+DB
retrieval trace), Phone Numbers (Vapi-native + Twilio/Telnyx bring-your-own,
inbound only), Integrations → Cal.com scheduling (LangGraph tool #2), chat
agents (same brain over HTTP, tested from the dashboard chat panel).

Deferred / not yet built: a Chat Logs screen (the
email verification at signup, invite links (a second
user in an existing tenant), password reset,
rescheduling/cancelling a booked meeting, outbound calling,
pagination on Call Logs (the newest 50 only — the API takes limit/offset, the
screen doesn't use them yet) and filtering by agent/status, Settings screen,
document object storage (only
extracted text is kept, not raw files), end-call *function* under custom-LLM
(endCallPhrases still work), true token-streaming from the graph (currently
computes then chunks), the two-venv consolidation, `infra/` deploy config.
