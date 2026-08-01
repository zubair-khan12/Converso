# Voice AI Platform — Backend (FastAPI)

Product API + internal admin panel.

## Stack
- **FastAPI** (async product API) + **uvicorn**
- Plain **SQLAlchemy 2.0** models + **Alembic** migrations (standalone)
- **sqladmin** internal admin panel at `/admin`
- PostgreSQL 15 + pgvector
- Package-per-domain layout under `app/` (auth, tenants, agents, knowledge,
  retrieval, orchestration, vapi, telephony, integrations, conversations, admin)

## One-time setup
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then fill in every REQUIRED value

# Postgres: create DB + enable pgvector
createdb voice_ai_platform
psql voice_ai_platform -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

## Configuration & secrets

**No secret has a working default in `config.py`.** That file is committed, so
a default that works is a secret that has already leaked. Everything sensitive
comes from the environment (`.env` locally, real env vars in production) and
defaults to empty, so a missing one fails at startup instead of silently
running on a public value.

Required (see `.env.example` for how to generate each):

| Variable | What it protects |
|---|---|
| `SECRET_KEY` | Signs the admin session cookie — forgeable if weak |
| `ENCRYPTION_KEY` | Fernet key encrypting every tenant's stored API keys |
| `DATABASE_URL` | Contains the DB password |
| `OPENAI_API_KEY` | Billed usage (knowledge base + scheduling) |

`ENVIRONMENT=production` turns the startup check from a warning into a hard
failure (exit 1): it refuses a missing secret, the repo's dev `SECRET_KEY`, a
localhost `PUBLIC_BACKEND_URL`, and localhost `CORS_ORIGINS`. A half-configured
instance that boots is worse than one that won't.

**There is no `VAPI_API_KEY` setting, on purpose.** Vapi, Cal.com, Twilio and
Telnyx credentials are *per tenant*, not platform-wide: each tenant pastes
their own in the dashboard and it is encrypted into the `integrations` table.
A shared platform key would put every tenant's calls on one account.

**Use a different `ENCRYPTION_KEY` per environment**, and note that rotating it
makes existing encrypted credentials unreadable — tenants must reconnect their
integrations afterwards.

## Migrations (standalone Alembic)
```bash
alembic upgrade head                 # apply latest schema
alembic revision --autogenerate -m "msg"   # new migration after model changes
alembic check                        # fail if models drift from the DB
```

## Admin panel access

`/admin` requires a sign-in and shows **every tenant's data**, so an admin
account is the most privileged credential in the system. Admins live in their
own `admin_users` table — a tenant `User`, even one with `role="owner"`, is
never an admin. Owning the Acme account must not grant access to Beta Corp's.

**The first admin** can't be created from the panel (nobody can sign in yet),
so bootstrap it once per environment:

```bash
python create_admin.py                        # prompts for email + password
```

**Adding more admins later** — two ways, both fine:

```bash
# From the panel (easiest once you're signed in):
#   /admin → Tenancy → Admins → New → set email + "Set password"

# Or from the command line, e.g. on the server:
python create_admin.py --email colleague@yourco.com --name "Their Name"
```

**Managing them:**

```bash
python create_admin.py --list                       # who has access, and last login
python create_admin.py --deactivate old@yourco.com  # revoke; takes effect immediately
python create_admin.py --activate  old@yourco.com   # restore
python create_admin.py --password-reset me@yourco.com
```

Notes that matter:
- Passwords are always **prompted**, never passed as arguments — arguments leak
  into shell history and `ps` output. Minimum 12 characters.
- Prefer **deactivating** over deleting: it revokes access on the admin's very
  next request (the session is re-checked against the DB each time) and is
  reversible.
- Sessions last 8 hours, then require signing in again.
- In production set `ENVIRONMENT=production` **and** a strong unique
  `SECRET_KEY` — it signs the admin session cookie, and the app refuses to
  start in production while it's still the repo's dev default.

## Seed / tenant users
```bash
python seed.py                       # sample tenant + owner@acme.test / password123
python manage.py create-user --tenant acme --email a@b.com --password secret --role member
python manage.py set-password --email a@b.com --password newsecret
python manage.py list-users
```
Tenant users can also be provisioned from the admin panel
(`/admin/user/create`) — the "Set password" field is hashed on save.

## Data model (§8)
`tenants` · `users` · `agents` · `documents` · `document_chunks` (vector) ·
`phone_numbers` · `integrations` · `conversations` · `messages` ·
`tool_executions`. Every customer-owned table carries `tenant_id`.
`admin_users` is the exception — platform staff, deliberately not tenant-scoped.

## Run
```bash
uvicorn app.main:app --reload --port 5000
#   API docs:  http://localhost:5000/docs
#   health:    http://localhost:5000/health
#   admin:     http://localhost:5000/admin
```
