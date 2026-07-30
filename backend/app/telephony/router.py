"""Phone number CRUD, kept in sync with Vapi (inbound calls only).

Mirrors `app/agents/router.py`'s two-places-kept-in-sync pattern: a local
`PhoneNumber` row plus a phone-number resource on Vapi. `provisioning_status`
records whether the two are in sync; `POST /{id}/retry` re-pushes local state
to Vapi when they've drifted (e.g. a failed create, or Vapi was unreachable).

A number's underlying carrier ("vapi" | "twilio" | "telnyx") only changes what
fields Vapi's create call needs — every number is still created, updated, and
deleted through Vapi's own `/phone-number` API (see `app/vapi/client.py`).
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..agents.models import Agent
from ..database import get_db
from ..deps import get_current_claims
from ..integrations.service import get_telnyx_credential_id, get_twilio_credentials, get_vapi_api_key
from ..vapi.client import (
    VapiError,
    build_phone_number_payload,
    create_phone_number,
    delete_phone_number,
    update_phone_number,
)
from ..vapi.client import list_phone_numbers as list_vapi_phone_numbers
from .models import TELEPHONY_PROVIDERS, PhoneNumber

router = APIRouter(prefix="/api/telephony", tags=["telephony"])


class CreatePhoneNumberRequest(BaseModel):
    provider: str
    agent_id: str | None = None
    # Vapi-native only — an optional hint, not guaranteed.
    area_code: str | None = None
    # Twilio/Telnyx only — the number you already own there, e.g. "+14155551234".
    number: str | None = None


class UpdatePhoneNumberRequest(BaseModel):
    # Reassign to a different agent. Use `detach: true` to remove any
    # assignment instead — a bare `agent_id: null` is ambiguous with "unset in
    # the request", so detaching is an explicit flag.
    agent_id: str | None = None
    detach: bool = False
    is_active: bool | None = None


def _require_vapi_key(db: Session, tenant_id: str) -> str:
    api_key = get_vapi_api_key(db, tenant_id)
    if api_key is None:
        raise HTTPException(
            status_code=400, detail="Connect your Vapi account before managing phone numbers."
        )
    return api_key


def _get_phone_number_or_404(db: Session, tenant_id: str, phone_number_id: str) -> PhoneNumber:
    pn = (
        db.query(PhoneNumber)
        .filter(PhoneNumber.id == phone_number_id, PhoneNumber.tenant_id == tenant_id)
        .first()
    )
    if pn is None:
        raise HTTPException(status_code=404, detail="Phone number not found.")
    return pn


def _get_ready_agent_or_400(db: Session, tenant_id: str, agent_id: str) -> Agent:
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.tenant_id == tenant_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found.")
    if not agent.vapi_assistant_id:
        raise HTTPException(
            status_code=400, detail="This agent isn't live on Vapi yet — fix its provisioning first."
        )
    return agent


def _phone_number_public(pn: PhoneNumber) -> dict:
    return {
        "id": str(pn.id),
        "provider": pn.provider,
        "e164": pn.e164,
        "agent_id": str(pn.agent_id) if pn.agent_id else None,
        "agent_name": pn.agent.name if pn.agent else None,
        "provisioning_status": pn.provisioning_status,
        "provisioning_error": pn.provisioning_error,
        "is_active": pn.is_active,
        "created_at": pn.created_at.isoformat() if pn.created_at else None,
    }


def _build_create_payload(db: Session, pn: PhoneNumber, assistant_id: str | None, area_code: str | None) -> dict:
    """The full provider-specific create payload, rebuilt from the tenant's
    stored credentials each time (never persisted on the PhoneNumber row)."""
    if pn.provider == "vapi":
        return build_phone_number_payload(
            provider="vapi", assistant_id=assistant_id, area_code=area_code
        )
    if pn.provider == "twilio":
        creds = get_twilio_credentials(db, pn.tenant_id)
        if not creds:
            raise VapiError("Twilio isn't connected — add your Twilio credentials first.")
        return build_phone_number_payload(
            provider="twilio",
            assistant_id=assistant_id,
            number=pn.e164,
            twilio_account_sid=creds["account_sid"],
            twilio_auth_token=creds["auth_token"],
        )
    if pn.provider == "telnyx":
        credential_id = get_telnyx_credential_id(db, pn.tenant_id)
        if not credential_id:
            raise VapiError("Telnyx isn't connected — add your Telnyx credential id first.")
        return build_phone_number_payload(
            provider="telnyx", assistant_id=assistant_id, number=pn.e164, telnyx_credential_id=credential_id
        )
    raise VapiError(f"Unknown provider '{pn.provider}'.")


def _find_existing_vapi_number(api_key: str, e164: str) -> dict | None:
    """A phone number already registered on this Vapi account with this exact
    E.164 number — e.g. added directly through Vapi's own dashboard, or a
    prior create that succeeded on Vapi but wasn't recorded locally. Vapi
    rejects creating a duplicate `number` outright, so importing an
    already-registered number must adopt it rather than create anew."""
    try:
        numbers = list_vapi_phone_numbers(api_key)
    except VapiError:
        return None  # fall through to a normal create attempt
    return next((n for n in numbers if n.get("number") == e164), None)


def _push_to_vapi(db: Session, pn: PhoneNumber, api_key: str, *, area_code: str | None = None) -> None:
    """Create (first time) or update (already on Vapi) the phone number to
    match local state. Never raises — status carries the outcome, same
    contract as `agents/router.py`'s `_push_to_vapi`."""
    assistant_id = pn.agent.vapi_assistant_id if pn.agent else None
    try:
        if pn.vapi_phone_number_id:
            update_phone_number(api_key, pn.vapi_phone_number_id, {"assistantId": assistant_id})
        else:
            # BYO numbers are imported by their E.164 value — check whether
            # Vapi already has this exact number registered before trying to
            # create a second, conflicting resource for it.
            existing = (
                _find_existing_vapi_number(api_key, pn.e164)
                if pn.provider in ("twilio", "telnyx") and pn.e164
                else None
            )
            if existing:
                pn.vapi_phone_number_id = existing.get("id")
                pn.e164 = existing.get("number") or pn.e164
                if assistant_id and existing.get("assistantId") != assistant_id:
                    update_phone_number(api_key, pn.vapi_phone_number_id, {"assistantId": assistant_id})
            else:
                payload = _build_create_payload(db, pn, assistant_id, area_code)
                created = create_phone_number(api_key, payload)
                pn.vapi_phone_number_id = created.get("id")
                pn.e164 = created.get("number") or pn.e164
        pn.provisioning_status = "ready"
        pn.provisioning_error = None
    except VapiError as exc:
        pn.provisioning_status = "failed"
        pn.provisioning_error = exc.message


@router.get("/numbers")
def list_phone_numbers(
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    numbers = (
        db.query(PhoneNumber)
        .filter(PhoneNumber.tenant_id == claims["tenant_id"])
        .order_by(PhoneNumber.created_at.desc())
        .all()
    )
    return {"phone_numbers": [_phone_number_public(pn) for pn in numbers]}


@router.post("/numbers", status_code=201)
def create_phone_number_endpoint(
    body: CreatePhoneNumberRequest,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    tenant_id = claims["tenant_id"]
    api_key = _require_vapi_key(db, tenant_id)

    if body.provider not in TELEPHONY_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{body.provider}'.")

    agent = None
    if body.agent_id:
        agent = _get_ready_agent_or_400(db, tenant_id, body.agent_id)

    number = (body.number or "").strip()
    area_code = (body.area_code or "").strip()
    if body.provider in ("twilio", "telnyx"):
        if not number:
            raise HTTPException(
                status_code=400, detail=f"Provide the {body.provider.title()} number to import (e.g. +14155551234)."
            )
        if body.provider == "twilio" and not get_twilio_credentials(db, tenant_id):
            raise HTTPException(status_code=400, detail="Connect Twilio under Integrations first.")
        if body.provider == "telnyx" and not get_telnyx_credential_id(db, tenant_id):
            raise HTTPException(status_code=400, detail="Connect Telnyx under Integrations first.")
    elif body.provider == "vapi":
        # Vapi's free/native numbers aren't a "just give me any number" pool —
        # despite being documented as optional, Vapi's API actually requires
        # an area code hint (or a SIP URI, which we don't support here) to
        # pick from. Enforce it up front rather than failing after the
        # pending row is already created.
        if not area_code:
            raise HTTPException(
                status_code=400, detail="A desired area code is required for a Vapi number (e.g. 415)."
            )

    pn = PhoneNumber(
        tenant_id=tenant_id,
        agent_id=agent.id if agent else None,
        provider=body.provider,
        e164=number or None,
        provisioning_status="pending",
    )
    db.add(pn)
    db.commit()
    db.refresh(pn)

    _push_to_vapi(db, pn, api_key, area_code=area_code or None)
    db.commit()
    db.refresh(pn)
    return _phone_number_public(pn)


@router.patch("/numbers/{phone_number_id}")
def update_phone_number_endpoint(
    phone_number_id: str,
    body: UpdatePhoneNumberRequest,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    tenant_id = claims["tenant_id"]
    pn = _get_phone_number_or_404(db, tenant_id, phone_number_id)
    api_key = _require_vapi_key(db, tenant_id)

    reassigned = False
    if body.detach:
        pn.agent_id = None
        reassigned = True
    elif body.agent_id is not None:
        agent = _get_ready_agent_or_400(db, tenant_id, body.agent_id)
        pn.agent_id = agent.id
        reassigned = True

    if body.is_active is not None:
        pn.is_active = body.is_active

    if reassigned:
        db.flush()  # so pn.agent reflects the new assignment before the push
        _push_to_vapi(db, pn, api_key)

    db.commit()
    db.refresh(pn)
    return _phone_number_public(pn)


@router.delete("/numbers/{phone_number_id}", status_code=200)
def delete_phone_number_endpoint(
    phone_number_id: str,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    tenant_id = claims["tenant_id"]
    pn = _get_phone_number_or_404(db, tenant_id, phone_number_id)

    if pn.vapi_phone_number_id:
        api_key = _require_vapi_key(db, tenant_id)
        try:
            delete_phone_number(api_key, pn.vapi_phone_number_id)
        except VapiError as exc:
            raise HTTPException(status_code=502, detail=f"Could not delete on Vapi: {exc.message}")

    db.delete(pn)
    db.commit()
    return {"deleted": True, "id": phone_number_id}


@router.post("/numbers/{phone_number_id}/retry")
def retry_phone_number(
    phone_number_id: str,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    tenant_id = claims["tenant_id"]
    pn = _get_phone_number_or_404(db, tenant_id, phone_number_id)
    api_key = _require_vapi_key(db, tenant_id)

    _push_to_vapi(db, pn, api_key)
    db.commit()
    db.refresh(pn)
    return _phone_number_public(pn)
