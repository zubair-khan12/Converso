"""Tenant-managed third-party credentials: Vapi (required), Twilio / Telnyx
(optional — bring-your-own phone number providers), and Cal.com (optional —
lets an agent book meetings mid-call).

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

from ..agents.models import Agent
from ..agents.provisioning import resync_tenant_agents
from ..calcom.client import CalComError, get_me, list_event_types
from ..calcom.prompt import build_scheduling_prompt
from ..core.crypto import decrypt, encrypt, mask
from ..database import get_db
from ..deps import get_current_claims
from ..vapi.client import VAPI_API_BASE
from .models import Integration
from .service import (
    CALCOM_PROVIDER,
    TELNYX_PROVIDER,
    TWILIO_PROVIDER,
    VAPI_PROVIDER,
    get_integration,
    get_vapi_api_key,
    get_vapi_integration,
)

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


# --- Cal.com (agent-driven scheduling) ---
#
# Unlike the telephony providers, connecting Cal.com changes what an *agent* can
# do: once an event type is picked, every assistant gains the booking tools and
# therefore has to run through our custom-LLM brain. So each write here re-pushes
# the tenant's assistants to Vapi (`_resync_agents`) — otherwise the tools would
# exist server-side while Vapi kept talking to its own built-in model.


class ConnectCalcomRequest(BaseModel):
    api_key: str


class SelectCalcomEventRequest(BaseModel):
    event_type_id: int
    # Which agent does the booking. Exactly one — a tenant's support line
    # shouldn't start offering meetings just because Cal.com was connected.
    agent_id: str
    # Override the timezone the agent speaks in. Defaults to the Cal.com
    # account's own timezone, which is what the tenant almost always wants.
    time_zone: str | None = None


DISCONNECTED_CALCOM = {
    "connected": False,
    "masked_key": None,
    "organizer_email": None,
    "time_zone": None,
    "event_types": [],
    "event_type_id": None,
    "event_title": None,
    "length_minutes": None,
    "agent_id": None,
    "agent_name": None,
    "scheduling_prompt": None,
}


def _resync_agents(db: Session, tenant_id: str) -> None:
    """Re-push assistants so a Cal.com change takes effect on live agents.
    Best-effort: a tenant without Vapi connected has nothing to re-push, and a
    Vapi outage is recorded per-agent as `provisioning_status="failed"` (fixable
    with Retry) rather than failing the Cal.com request the tenant just made."""
    api_key = get_vapi_api_key(db, tenant_id)
    if not api_key:
        return
    resync_tenant_agents(db, tenant_id, api_key)
    db.commit()


def _calcom_status(
    db: Session, integration: Integration | None, *, event_types: list[dict] | None = None
) -> dict:
    if integration is None or not integration.is_active:
        return dict(DISCONNECTED_CALCOM)
    try:
        api_key = decrypt((integration.credentials or {}).get("api_key_encrypted", ""))
    except ValueError:
        return dict(DISCONNECTED_CALCOM)

    cfg = integration.config or {}
    if event_types is None:
        event_types = cfg.get("event_types") or []

    # Resolve the linked agent fresh rather than trusting a cached name — the
    # agent may have been renamed, or deleted out from under the link.
    agent = None
    if cfg.get("agent_id"):
        agent = (
            db.query(Agent)
            .filter(Agent.id == cfg["agent_id"], Agent.tenant_id == integration.tenant_id)
            .first()
        )

    # The copy-paste prompt only exists once there's a concrete event *and* an
    # agent to book it — that pair is what actually turns scheduling on.
    prompt = None
    if cfg.get("event_type_id") and agent is not None:
        prompt = build_scheduling_prompt(
            event_title=cfg.get("event_title") or "meeting",
            length_minutes=cfg.get("length_minutes"),
            time_zone=cfg.get("time_zone") or "UTC",
        )

    return {
        "connected": True,
        "masked_key": mask(api_key),
        "organizer_email": cfg.get("organizer_email"),
        "time_zone": cfg.get("time_zone"),
        "event_types": event_types,
        "event_type_id": cfg.get("event_type_id"),
        "event_title": cfg.get("event_title"),
        "length_minutes": cfg.get("length_minutes"),
        "agent_id": str(agent.id) if agent else None,
        "agent_name": agent.name if agent else None,
        "scheduling_prompt": prompt,
    }


@router.get("/calcom")
def get_calcom_status(
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    """Current connection plus a *live* event-type list, so an event the tenant
    just created on cal.com shows up without reconnecting. If Cal.com is
    unreachable we fall back to the list cached at connect time rather than
    showing the integration as broken."""
    integration = get_integration(db, claims["tenant_id"], CALCOM_PROVIDER)
    if integration is None or not integration.is_active:
        return dict(DISCONNECTED_CALCOM)

    event_types = None
    api_key = _decrypt_calcom_key(integration)
    if api_key:
        try:
            event_types = list_event_types(api_key, (integration.config or {}).get("username"))
        except CalComError:
            event_types = None  # fall back to the cached list
    return _calcom_status(db, integration, event_types=event_types)


def _calcom_key_hint(exc: CalComError) -> str:
    """What to actually *do* about a rejected Cal.com key.

    Cal.com rejects an unrecognised key in its rate-limit guard, before auth
    ever runs, so the message is the same whether the key is mistyped, expired,
    truncated, or from a self-hosted instance. Expiry is by far the most common
    and the least obvious: **Cal.com API keys expire after 30 days unless
    "Never expires" was ticked**, and an expired key looks identical to a wrong
    one. Worth naming, because nobody guesses it.
    """
    if exc.status_code not in (401, 403):
        return ""
    return (
        " Cal.com API keys expire after 30 days unless you tick “Never expires”,"
        " and an expired key fails exactly like a wrong one — create a fresh key"
        " at cal.com → Settings → Developer → API keys and paste the whole thing"
        " (it's only shown once). It must be a cal.com cloud key; keys from a"
        " self-hosted instance aren't accepted by their API."
    )


def _decrypt_calcom_key(integration: Integration) -> str | None:
    try:
        return decrypt((integration.credentials or {}).get("api_key_encrypted", "")) or None
    except ValueError:
        return None


@router.post("/calcom")
def connect_calcom(
    body: ConnectCalcomRequest,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    api_key = body.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="Provide your Cal.com API key.")

    # Validate against Cal.com before saving, and pick up the account's own
    # timezone + email in the same round trip — those are what the agent speaks
    # in and books under, so there's nothing further for the tenant to type.
    try:
        me = get_me(api_key)
        event_types = list_event_types(api_key, me.get("username"))
    except CalComError as exc:
        # Pass Cal.com's own message straight through. A 401 here is not
        # necessarily a mistyped key — a self-hosted key, or a plan that doesn't
        # cover the endpoint, fails the same way, and only their wording says
        # which. Hiding it behind "Invalid API key" sends people hunting for a
        # typo that isn't there.
        status = 400 if exc.status_code in (400, 401, 403) else 502
        raise HTTPException(status_code=status, detail=exc.message + _calcom_key_hint(exc))

    integration = get_integration(db, claims["tenant_id"], CALCOM_PROVIDER)
    prev = (integration.config or {}) if integration else {}
    cfg = {
        "username": me.get("username"),
        "organizer_email": me.get("email"),
        "time_zone": prev.get("time_zone") or me.get("timeZone") or "UTC",
        "event_types": event_types,
    }
    # Keep a previously chosen event only if it still exists on the account.
    chosen = next((e for e in event_types if e["id"] == prev.get("event_type_id")), None)
    if chosen:
        cfg["event_type_id"] = chosen["id"]
        cfg["event_title"] = chosen["title"]
        cfg["length_minutes"] = chosen["length_minutes"]
    # The booking agent is never guessed — reconnecting keeps whichever agent
    # was already linked, and a first-time connect leaves it for the tenant to
    # choose, since arming the wrong agent is worse than arming none.
    if prev.get("agent_id"):
        cfg["agent_id"] = prev["agent_id"]

    creds = {"api_key_encrypted": encrypt(api_key)}
    if integration is None:
        integration = Integration(
            tenant_id=claims["tenant_id"], provider=CALCOM_PROVIDER,
            credentials=creds, config=cfg, is_active=True,
        )
        db.add(integration)
    else:
        integration.credentials = creds
        integration.config = cfg
        integration.is_active = True
    db.commit()

    _resync_agents(db, claims["tenant_id"])
    return _calcom_status(db, integration, event_types=event_types)


@router.patch("/calcom")
def select_calcom_event(
    body: SelectCalcomEventRequest,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    """Link an event type to one agent. This pair is what actually switches
    scheduling on — a connected key on its own books nothing."""
    tenant_id = claims["tenant_id"]
    integration = get_integration(db, tenant_id, CALCOM_PROVIDER)
    if integration is None or not integration.is_active:
        raise HTTPException(status_code=400, detail="Connect Cal.com first.")

    api_key = _decrypt_calcom_key(integration)
    if not api_key:
        raise HTTPException(status_code=400, detail="Reconnect Cal.com — the stored key is unreadable.")

    agent = (
        db.query(Agent)
        .filter(Agent.id == body.agent_id, Agent.tenant_id == tenant_id)
        .first()
    )
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found.")
    if not agent.vapi_assistant_id:
        raise HTTPException(
            status_code=400,
            detail="That agent isn't live on Vapi yet — fix its provisioning before linking Cal.com.",
        )

    cfg = dict(integration.config or {})
    try:
        event_types = list_event_types(api_key, cfg.get("username"))
    except CalComError as exc:
        raise HTTPException(status_code=502, detail=exc.message)

    chosen = next((e for e in event_types if e["id"] == body.event_type_id), None)
    if chosen is None:
        raise HTTPException(status_code=400, detail="That event type isn't on this Cal.com account.")

    cfg["event_types"] = event_types
    cfg["event_type_id"] = chosen["id"]
    cfg["event_title"] = chosen["title"]
    cfg["length_minutes"] = chosen["length_minutes"]
    cfg["agent_id"] = str(agent.id)
    if body.time_zone:
        cfg["time_zone"] = body.time_zone.strip()
    integration.config = cfg
    db.commit()

    # Tenant-wide, not just the linked agent: re-linking has to strip the tools
    # from whichever agent held them before.
    _resync_agents(db, tenant_id)
    return _calcom_status(db, integration, event_types=event_types)


@router.delete("/calcom")
def disconnect_calcom(
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    integration = get_integration(db, claims["tenant_id"], CALCOM_PROVIDER)
    if integration is not None:
        db.delete(integration)
        db.commit()
        # Assistants lose the booking tools — re-push so a trained-only agent
        # goes back to plain RAG, and an untrained one back to Vapi's own model.
        _resync_agents(db, claims["tenant_id"])
    return dict(DISCONNECTED_CALCOM)
