"""Tenant-managed third-party credentials: Vapi (required), and Twilio /
Telnyx (optional — bring-your-own phone number providers).

Vapi's API key is required before any voice agent can be created; Twilio and
Telnyx are only needed if the tenant wants to import a number they already
own on one of those platforms (see `app/telephony/router.py`) instead of
using a Vapi-native number.
"""
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.crypto import decrypt, encrypt, mask
from ..database import get_db
from ..deps import get_current_claims
from ..vapi.client import VAPI_API_BASE
from .models import Integration
from .service import TELNYX_PROVIDER, TWILIO_PROVIDER, VAPI_PROVIDER, get_integration, get_vapi_integration

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


# --- Twilio (bring-your-own phone number) ---


class ConnectTwilioRequest(BaseModel):
    account_sid: str
    auth_token: str


DISCONNECTED_SIMPLE = {"connected": False, "masked_key": None}


def _simple_status(integration: Integration | None, *, masked_from: str | None = None) -> dict:
    if integration is None or not integration.is_active:
        return dict(DISCONNECTED_SIMPLE)
    creds = integration.credentials or {}
    try:
        plaintext = decrypt(creds.get(masked_from, "")) if masked_from else ""
    except ValueError:
        return dict(DISCONNECTED_SIMPLE)
    return {"connected": True, "masked_key": mask(plaintext) if plaintext else None}


@router.get("/twilio")
def get_twilio_status(
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    integration = get_integration(db, claims["tenant_id"], TWILIO_PROVIDER)
    return _simple_status(integration, masked_from="account_sid_encrypted")


@router.post("/twilio")
def connect_twilio(
    body: ConnectTwilioRequest,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    sid = body.account_sid.strip()
    token = body.auth_token.strip()
    if not sid or not token:
        raise HTTPException(status_code=400, detail="Provide both the Account SID and Auth Token.")

    # Validate against Twilio before saving — a cheap real call so a typo
    # doesn't get silently persisted as "connected".
    try:
        resp = httpx.get(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}.json",
            auth=(sid, token),
            timeout=10.0,
        )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach Twilio. Try again.")
    if resp.status_code == 401:
        raise HTTPException(status_code=400, detail="Invalid Twilio Account SID or Auth Token.")
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Twilio rejected the request (HTTP {resp.status_code}).")

    integration = get_integration(db, claims["tenant_id"], TWILIO_PROVIDER)
    creds = {"account_sid_encrypted": encrypt(sid), "auth_token_encrypted": encrypt(token)}
    if integration is None:
        integration = Integration(
            tenant_id=claims["tenant_id"], provider=TWILIO_PROVIDER,
            credentials=creds, config={}, is_active=True,
        )
        db.add(integration)
    else:
        integration.credentials = creds
        integration.is_active = True
    db.commit()

    return _simple_status(integration, masked_from="account_sid_encrypted")


@router.delete("/twilio")
def disconnect_twilio(
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    integration = get_integration(db, claims["tenant_id"], TWILIO_PROVIDER)
    if integration is not None:
        db.delete(integration)
        db.commit()
    return dict(DISCONNECTED_SIMPLE)


# --- Telnyx (bring-your-own phone number) ---


class ConnectTelnyxRequest(BaseModel):
    credential_id: str


@router.get("/telnyx")
def get_telnyx_status(
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    integration = get_integration(db, claims["tenant_id"], TELNYX_PROVIDER)
    return _simple_status(integration, masked_from="credential_id_encrypted")


@router.post("/telnyx")
def connect_telnyx(
    body: ConnectTelnyxRequest,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    credential_id = body.credential_id.strip()
    if not credential_id:
        raise HTTPException(status_code=400, detail="Provide your Telnyx credential id.")

    # This is NOT anything from Telnyx's own dashboard — Vapi has no public API
    # to create/validate credentials, so this must be the UUID Vapi generated
    # after the tenant added a Telnyx credential at dashboard.vapi.ai/keys
    # (using their Telnyx API key there). Catch the common mistake of pasting
    # a Telnyx-side value here immediately, rather than failing later and more
    # confusingly when actually importing a number.
    try:
        uuid.UUID(credential_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=(
                "That doesn't look like a Vapi credential id. Add a Telnyx "
                "credential at dashboard.vapi.ai/keys (using your Telnyx API "
                "key) and paste the UUID Vapi gives you back — not anything "
                "from Telnyx's own dashboard."
            ),
        )
    integration = get_integration(db, claims["tenant_id"], TELNYX_PROVIDER)
    creds = {"credential_id_encrypted": encrypt(credential_id)}
    if integration is None:
        integration = Integration(
            tenant_id=claims["tenant_id"], provider=TELNYX_PROVIDER,
            credentials=creds, config={}, is_active=True,
        )
        db.add(integration)
    else:
        integration.credentials = creds
        integration.is_active = True
    db.commit()

    return _simple_status(integration, masked_from="credential_id_encrypted")


@router.delete("/telnyx")
def disconnect_telnyx(
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    integration = get_integration(db, claims["tenant_id"], TELNYX_PROVIDER)
    if integration is not None:
        db.delete(integration)
        db.commit()
    return dict(DISCONNECTED_SIMPLE)
