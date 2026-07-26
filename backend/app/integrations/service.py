"""Integration helpers shared across routers."""
from sqlalchemy.orm import Session

from ..core.crypto import decrypt
from .models import Integration

VAPI_PROVIDER = "vapi"


def get_vapi_integration(db: Session, tenant_id: str) -> Integration | None:
    return (
        db.query(Integration)
        .filter(Integration.tenant_id == tenant_id, Integration.provider == VAPI_PROVIDER)
        .first()
    )


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
