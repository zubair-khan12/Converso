"""Shared FastAPI dependencies (auth, tenant scoping)."""
from fastapi import Header, HTTPException

from .auth.service import decode_access_token


def get_current_claims(authorization: str | None = Header(default=None)) -> dict:
    """Decode the Bearer token and return its claims, or 401.

    The frontend calls the backend server-to-server with the JWT taken from the
    httpOnly session cookie, so identity always comes from a verified token —
    never from a client-supplied tenant_id.
    """
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    claims = decode_access_token(token)
    if claims is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return claims
