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
cp .env.example .env          # then edit DATABASE_URL / SECRET_KEY

# Postgres: create DB + enable pgvector
createdb voice_ai_platform
psql voice_ai_platform -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

## Migrations (standalone Alembic)
```bash
alembic upgrade head                 # apply latest schema
alembic revision --autogenerate -m "msg"   # new migration after model changes
alembic check                        # fail if models drift from the DB
```

## Seed / users
```bash
python seed.py                       # sample tenant + owner@acme.test / password123
python manage.py create-user --tenant acme --email a@b.com --password secret --role member
python manage.py set-password --email a@b.com --password newsecret
python manage.py list-users
```
Users can also be provisioned from the admin panel (`/admin/user/create`) — the
"Set password" field is hashed on save.

## Data model (§8)
`tenants` · `users` · `agents` · `documents` · `document_chunks` (vector) ·
`phone_numbers` · `integrations` · `conversations` · `messages` ·
`tool_executions`. Every customer-owned table carries `tenant_id`.

## Run
```bash
uvicorn app.main:app --reload --port 5000
#   API docs:  http://localhost:5000/docs
#   health:    http://localhost:5000/health
#   admin:     http://localhost:5000/admin
```
