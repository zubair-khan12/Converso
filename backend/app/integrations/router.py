"""Tenant-managed third-party credentials. Currently: Vapi only.

The tenant's Vapi API key is required before any voice agent can be created
(a later phase); this router just lets them connect/inspect/remove it.
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.crypto import decrypt, encrypt, mask
from ..database import get_db
from ..deps import get_current_claims
from ..vapi.client import VAPI_API_BASE
from .models import Integration
from .service import VAPI_PROVIDER, get_vapi_integration

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


class ConnectVapiRequest(BaseModel):
    # Both optional so the connected card can add just a public key later,
    # but at least one must be present (validated in the handler).
    api_key: str | None = None
    public_key: str | None = None


DISCONNECTED = {"connected": False, "masked_key": None, "has_public_key": False}


def _status_payload(integration: Integration | None) -> dict:
    if integration is None or not integration.is_active:
        return dict(DISCONNECTED)
    creds = integration.credentials or {}
    try:
        plaintext = decrypt(creds.get("api_key_encrypted", ""))
    except ValueError:
        # Key can't be decrypted (e.g. ENCRYPTION_KEY rotated) — treat as
        # disconnected rather than crash; the tenant will need to reconnect.
        return dict(DISCONNECTED)
    return {
        "connected": True,
        "masked_key": mask(plaintext),
        "has_public_key": bool(creds.get("public_key_encrypted")),
    }


@router.get("/vapi")
def get_vapi_status(
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    integration = get_vapi_integration(db, claims["tenant_id"])
    return _status_payload(integration)


@router.post("/vapi")
def connect_vapi(
    body: ConnectVapiRequest,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    api_key = (body.api_key or "").strip()
    public_key = (body.public_key or "").strip()
    if not api_key and not public_key:
        raise HTTPException(status_code=400, detail="Provide a Vapi API key.")

    # Validate the private key against Vapi before saving — a cheap real call
    # so a typo doesn't get silently persisted as "connected". The public key
    # is publishable and can't be validated this way, so we just store it.
    if api_key:
        try:
            resp = httpx.get(
                f"{VAPI_API_BASE}/assistant",
                params={"limit": 1},
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10.0,
            )
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="Could not reach Vapi. Try again.")
        if resp.status_code == 401:
            raise HTTPException(status_code=400, detail="Invalid Vapi API key.")
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=502, detail=f"Vapi rejected the request (HTTP {resp.status_code})."
            )

    integration = get_vapi_integration(db, claims["tenant_id"])
    # Merge into existing credentials so adding one key never wipes the other.
    creds = dict(integration.credentials) if integration else {}
    if api_key:
        creds["api_key_encrypted"] = encrypt(api_key)
    if public_key:
        creds["public_key_encrypted"] = encrypt(public_key)

    if "api_key_encrypted" not in creds:
        raise HTTPException(
            status_code=400, detail="Add your private API key before the public key."
        )

    if integration is None:
        integration = Integration(
            tenant_id=claims["tenant_id"],
            provider=VAPI_PROVIDER,
            credentials=creds,
            config={},
            is_active=True,
        )
        db.add(integration)
    else:
        integration.credentials = creds
        integration.is_active = True
    db.commit()

    return _status_payload(integration)


@router.delete("/vapi")
def disconnect_vapi(
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    integration = get_vapi_integration(db, claims["tenant_id"])
    if integration is not None:
        db.delete(integration)
        db.commit()
    return dict(DISCONNECTED)
