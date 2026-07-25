"""FastAPI application entrypoint.

Run locally with:
    uvicorn app.main:app --reload --port 5000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (registers all ORM tables)
from .admin import init_admin
from .auth.router import router as auth_router
from .config import settings
from .database import engine
from .integrations.router import router as integrations_router

app = FastAPI(title="Voice AI SaaS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public JSON API.
app.include_router(auth_router)
app.include_router(integrations_router)

# Internal admin panel at /admin.
init_admin(app, engine)


@app.get("/health")
def health():
    return {"status": "ok"}
