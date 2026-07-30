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

No public signup — an admin provisions users via `/admin` (sqladmin). Login:

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

## Voice agents + RAG (Vapi custom-LLM brain)

An agent lives in two places: a local `Agent` row and a Vapi assistant, kept in
sync by `app/agents/router.py`. Two model modes:

- **Untrained** (no knowledge base): Vapi runs its own built-in OpenAI model.
- **Trained** (has embedded knowledge): the assistant's `model.provider` is
  `custom-llm` pointed at `{PUBLIC_BACKEND_URL}/api/vapi/custom-llm/{agent_id}`,
  so Vapi routes **every turn** to our LangGraph RAG agent
  (`app/vapi/rag_agent.py`: retrieve → generate), which embeds the query,
  cosine-searches `document_chunks` (pgvector, agent-scoped), and streams an
  OpenAI-compatible SSE reply. The agent id in the path is the capability token
  (never trusted from the request body). Knowledge base = agentic tool #1;
  Cal.com will be tool #2.

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
inbound only). Chat agents tab locked ("Launching soon").

Deferred / not yet built: real `GET /api/dashboard/summary` (dashboard shows
placeholders), Cal.com scheduling tool (LangGraph tool #2), outbound calling,
Call Logs/Integrations/Settings screens, document object storage (only
extracted text is kept, not raw files), end-call *function* under custom-LLM
(endCallPhrases still work), true token-streaming from the graph (currently
computes then chunks), the two-venv consolidation, `infra/` deploy config.
