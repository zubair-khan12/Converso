"""Integration helpers shared across routers."""
from sqlalchemy.orm import Session

from ..core.crypto import decrypt
from .models import Integration

VAPI_PROVIDER = "vapi"
TWILIO_PROVIDER = "twilio"
TELNYX_PROVIDER = "telnyx"


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
