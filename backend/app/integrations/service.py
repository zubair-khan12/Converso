"""Integration helpers shared across routers."""
from sqlalchemy.orm import Session

from ..core.crypto import decrypt
from .models import Integration

VAPI_PROVIDER = "vapi"
TWILIO_PROVIDER = "twilio"
TELNYX_PROVIDER = "telnyx"
CALCOM_PROVIDER = "calcom"


def get_integration(db: Session, tenant_id: str, provider: str) -> Integration | None:
    return (
        db.query(Integration)
        .filter(Integration.tenant_id == tenant_id, Integration.provider == provider)
        .first()
    )


def get_vapi_integration(db: Session, tenant_id: str) -> Integration | None:
    return get_integration(db, tenant_id, VAPI_PROVIDER)


def _decrypt_credential(integration: Integration | None, key: str) -> str | None:
    if integration is None or not integration.is_active:
        return None
    token = (integration.credentials or {}).get(key)
    if not token:
        return None
    try:
        return decrypt(token)
    except ValueError:
        return None


def get_vapi_api_key(db: Session, tenant_id: str) -> str | None:
    """The tenant's decrypted Vapi private API key (server-side use)."""
    return _decrypt_credential(get_vapi_integration(db, tenant_id), "api_key_encrypted")


def get_vapi_public_key(db: Session, tenant_id: str) -> str | None:
    """The tenant's decrypted Vapi public key (safe to hand to the browser)."""
    return _decrypt_credential(get_vapi_integration(db, tenant_id), "public_key_encrypted")


def get_twilio_credentials(db: Session, tenant_id: str) -> dict | None:
    """The tenant's decrypted Twilio Account SID + Auth Token, or None if not
    connected. Used server-side only when importing a Twilio number into Vapi."""
    integration = get_integration(db, tenant_id, TWILIO_PROVIDER)
    sid = _decrypt_credential(integration, "account_sid_encrypted")
    token = _decrypt_credential(integration, "auth_token_encrypted")
    if not sid or not token:
        return None
    return {"account_sid": sid, "auth_token": token}


def get_telnyx_credential_id(db: Session, tenant_id: str) -> str | None:
    """The tenant's stored Telnyx credential id (created in Telnyx's own
    dashboard — not a raw secret, but encrypted at rest for consistency)."""
    return _decrypt_credential(get_integration(db, tenant_id, TELNYX_PROVIDER), "credential_id_encrypted")


def get_calcom_config(db: Session, tenant_id: str, agent_id: str) -> dict | None:
    """Everything the scheduling tools need for *this agent*, or None if it
    can't book.

    Scheduling is deliberately scoped to a single agent rather than the whole
    tenant: a support line and a sales line shouldn't both start offering
    meetings just because Cal.com was connected once. So this returns None when
    Cal.com was never connected, when no event type has been picked, *and* when
    the booking agent is a different one — callers read any of those as
    "scheduling is off for this agent".
    """
    integration = get_integration(db, tenant_id, CALCOM_PROVIDER)
    api_key = _decrypt_credential(integration, "api_key_encrypted")
    if not api_key:
        return None
    cfg = integration.config or {}
    if not cfg.get("event_type_id") or not cfg.get("agent_id"):
        return None
    if str(cfg["agent_id"]) != str(agent_id):
        return None
    return {
        "api_key": api_key,
        "agent_id": str(cfg["agent_id"]),
        "event_type_id": int(cfg["event_type_id"]),
        "event_title": cfg.get("event_title") or "meeting",
        "length_minutes": cfg.get("length_minutes"),
        # The Cal.com account's own timezone — the agent speaks in it, so the
        # tenant never has to ask a caller what timezone they're in.
        "time_zone": cfg.get("time_zone") or "UTC",
        "organizer_email": cfg.get("organizer_email"),
    }


def calcom_ready(db: Session, tenant_id: str, agent_id: str) -> bool:
    """Whether this specific agent should be given the scheduling tools."""
    return get_calcom_config(db, tenant_id, agent_id) is not None
