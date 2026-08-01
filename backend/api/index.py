"""Vercel serverless entrypoint.

Vercel's Python runtime looks for an ASGI app named `app` in `api/index.py`;
`vercel.json` rewrites every path to this file, so FastAPI keeps doing its own
routing (including `/admin`) exactly as it does under uvicorn locally.

Nothing app-specific belongs here — this is only the adapter.
"""
from app.main import app  # noqa: F401
