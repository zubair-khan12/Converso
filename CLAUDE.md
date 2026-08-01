# Converso — Voice AI SaaS

Multi-tenant platform: a business signs up (provisioned by admin, no public
signup), builds a voice agent, gives it a knowledge base and tools, attaches
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
- **Tenant users** (`users`) sign in to the product. No public signup — an admin
  provisions them via `/admin`. Login:

1. Browser → Next.js Route Handler (`/api/auth/login`, same origin)
2. Route Handler → FastAPI `/api/auth/login` server-to-server
3. FastAPI returns a JWT; Next.js sets it as an **httpOnly, Secure-in-prod**
   cookie (`converso_session`) — never localStorage/sessionStorage, and the
   browser never sees the raw JWT.
4. Server components call `getCurrentUser()` (`frontend/lib/session.ts`),
   which verifies the cookie against `GET /api/auth/me` on every request.

`users.onboarded` (boolean) drives a one-time post-login tour: first login →
`/getting-started`, everyone else → `/dashboard` directly. Set via
`POST /api/auth/onboarded`, idempotent, never flips back.

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
- One Alembic migration currently: `aa97fec2a867_initial_schema...` — squash
  small schema tweaks into it while nothing is deployed elsewhere; once
  anything ships beyond this local dev DB, switch back to additive migrations.
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
  Tailwind + shadcn.

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

Done: landing page, login (httpOnly cookie), first-login onboarding tour,
dashboard shell, dashboard home (honest empty states), Configure Vapi (key
encrypted at rest), Voice agents CRUD synced to Vapi + web test calls,
Knowledge Base (text/PDF upload, LangGraph RAG via custom-LLM, console+DB
retrieval trace), Phone Numbers (Vapi-native + Twilio/Telnyx bring-your-own,
inbound only), Integrations → Cal.com scheduling (LangGraph tool #2). Chat
agents tab locked ("Launching soon").

Deferred / not yet built: real `GET /api/dashboard/summary` (dashboard shows
placeholders), rescheduling/cancelling a booked meeting, outbound calling,
Call Logs/Settings screens, document object storage (only
extracted text is kept, not raw files), end-call *function* under custom-LLM
(endCallPhrases still work), true token-streaming from the graph (currently
computes then chunks), the two-venv consolidation, `infra/` deploy config.
