"""Shared FastAPI dependencies (auth, tenant scoping, account status)."""
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .auth.service import decode_access_token
from .database import get_db
from .tenants.models import Tenant

# Sent alongside the 403 so the frontend can tell "your account is locked"
# apart from "you're not allowed to do this particular thing", and show the
# account screen instead of a generic error.
ACCOUNT_DISABLED_CODE = "account_disabled"


def get_token_claims(authorization: str | None = Header(default=None)) -> dict:
    """Decode the Bearer token and return its claims, or 401.

    Identity-only: this deliberately does NOT check whether the account is
    enabled, so /me and the auth endpoints keep working for a locked-out user
    and can tell them why. Product endpoints want `get_current_claims`.
    """
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    claims = decode_access_token(token)
    if claims is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return claims


def get_current_claims(
    claims: dict = Depends(get_token_claims),
    db: Session = Depends(get_db),
) -> dict:
    """Verified claims for a user whose account is in good standing.

    The account check lives here, in the dependency every product router
    already goes through, rather than at each call site — a gate you have to
    remember to add is a gate that will eventually be missing from exactly one
    endpoint. A new router gets it for free.
    """
    tenant = db.get(Tenant, claims["tenant_id"])
    if tenant is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    if not tenant.is_enabled:
        raise HTTPException(
            status_code=403,
            detail={
                "code": ACCOUNT_DISABLED_CODE,
                "message": tenant.lock_reason or "This account is not active.",
            },
        )
    return claims
