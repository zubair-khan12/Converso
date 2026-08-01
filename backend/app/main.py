"""FastAPI application entrypoint.

Run locally with:
    uvicorn app.main:app --reload --port 5000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (registers all ORM tables)
from .admin import init_admin
from .agents.router import router as agents_router
from .auth.router import router as auth_router
from .config import settings, validate_settings
from .database import engine
from .integrations.router import router as integrations_router
from .knowledge.router import router as knowledge_router
from .telephony.router import router as telephony_router
from .vapi.router import router as vapi_router

# Check secrets before anything is wired up: in production this exits rather
# than serving traffic half-configured; in development it just warns.
validate_settings()

app = FastAPI(title="Voice AI SaaS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public JSON API.
app.include_router(auth_router)
app.include_router(integrations_router)
app.include_router(vapi_router)
app.include_router(agents_router)
app.include_router(knowledge_router)
app.include_router(telephony_router)

# Internal admin panel at /admin.
init_admin(app, engine)


@app.get("/health")
def health():
    return {"status": "ok"}
