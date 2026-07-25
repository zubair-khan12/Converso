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
  admin panel, PyJWT for tokens, Werkzeug only for `check_password_hash`.
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

## Current scope / state

Done: landing page, login (httpOnly cookie), first-login onboarding tour,
dashboard shell (sidebar/topbar, collapsible, mobile drawer), dashboard home
with honest empty states (no fabricated metrics), Voice/Chat agents tab
(Chat locked — "Launching soon").

Deferred / not yet built: real `GET /api/dashboard/summary` and
`GET /api/agents` endpoints (dashboard currently shows placeholders),
Agents/Knowledge Base/Phone Numbers/Call Logs/Integrations/Settings screens,
Vapi integration, the two-venv consolidation, `infra/` deploy config.
