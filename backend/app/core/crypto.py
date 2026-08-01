"""Symmetric encryption for credentials stored at rest (e.g. tenant Vapi API
keys). Reversible by design — we need the plaintext back to call the
third-party API on the tenant's behalf, so this is encryption, not hashing.
"""
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from ..config import settings


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    """Built on first use, not at import.

    ENCRYPTION_KEY has no default any more, so building this at import time
    would crash the whole app — including `alembic`, `create_admin.py` and
    anything else that merely imports a model — before the startup check gets a
    chance to explain what's wrong.
    """
    key = settings.ENCRYPTION_KEY
    if not key:
        raise RuntimeError(
            "ENCRYPTION_KEY is not set — integration credentials cannot be "
            "encrypted or decrypted. Generate one with: python -c "
            '"from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        )
    try:
        return Fernet(key.encode())
    except (ValueError, TypeError) as exc:
        raise RuntimeError(
            "ENCRYPTION_KEY is not a valid Fernet key (needs urlsafe-base64, "
            "32 bytes). Generate one with: python -c "
            '"from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        ) from exc


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Raises ValueError if the token is invalid or was encrypted with a
    different key (e.g. ENCRYPTION_KEY rotated without re-encrypting data)."""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Could not decrypt credential — invalid or stale ENCRYPTION_KEY.") from exc


def mask(plaintext: str) -> str:
    """Show only the last 4 characters, for display without exposing the key."""
    if len(plaintext) <= 4:
        return "*" * len(plaintext)
    return f"{'*' * (len(plaintext) - 4)}{plaintext[-4:]}"
