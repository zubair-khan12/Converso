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
from .models import Integration

router = APIRouter(prefix="/api/integrations", tags=["integrations"])

VAPI_PROVIDER = "vapi"
VAPI_API_BASE = "https://api.vapi.ai"


class ConnectVapiRequest(BaseModel):
    api_key: str


def _vapi_integration(db: Session, tenant_id: str) -> Integration | None:
    return (
        db.query(Integration)
        .filter(Integration.tenant_id == tenant_id, Integration.provider == VAPI_PROVIDER)
        .first()
    )


def _status_payload(integration: Integration | None) -> dict:
    if integration is None or not integration.is_active:
        return {"connected": False, "masked_key": None}
    encrypted = integration.credentials.get("api_key_encrypted", "")
    try:
        plaintext = decrypt(encrypted)
    except ValueError:
        # Key can't be decrypted (e.g. ENCRYPTION_KEY rotated) — treat as
        # disconnected rather than crash; the tenant will need to reconnect.
        return {"connected": False, "masked_key": None}
    return {"connected": True, "masked_key": mask(plaintext)}


@router.get("/vapi")
def get_vapi_status(
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    integration = _vapi_integration(db, claims["tenant_id"])
    return _status_payload(integration)


@router.post("/vapi")
def connect_vapi(
    body: ConnectVapiRequest,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    api_key = body.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="API key is required.")

    # Validate against Vapi itself before saving anything — a cheap real call
    # so a typo doesn't get silently persisted as "connected".
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

    encrypted = encrypt(api_key)
    integration = _vapi_integration(db, claims["tenant_id"])
    if integration is None:
        integration = Integration(
            tenant_id=claims["tenant_id"],
            provider=VAPI_PROVIDER,
            credentials={"api_key_encrypted": encrypted},
            config={},
            is_active=True,
        )
        db.add(integration)
    else:
        integration.credentials = {"api_key_encrypted": encrypted}
        integration.is_active = True
    db.commit()

    return _status_payload(integration)


@router.delete("/vapi")
def disconnect_vapi(
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    integration = _vapi_integration(db, claims["tenant_id"])
    if integration is not None:
        db.delete(integration)
        db.commit()
    return {"connected": False, "masked_key": None}
