"""Symmetric encryption for credentials stored at rest (e.g. tenant Vapi API
keys). Reversible by design — we need the plaintext back to call the
third-party API on the tenant's behalf, so this is encryption, not hashing.
"""
from cryptography.fernet import Fernet, InvalidToken

from ..config import settings

_fernet = Fernet(settings.ENCRYPTION_KEY.encode())


def encrypt(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Raises ValueError if the token is invalid or was encrypted with a
    different key (e.g. ENCRYPTION_KEY rotated without re-encrypting data)."""
    try:
        return _fernet.decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Could not decrypt credential — invalid or stale ENCRYPTION_KEY.") from exc


def mask(plaintext: str) -> str:
    """Show only the last 4 characters, for display without exposing the key."""
    if len(plaintext) <= 4:
        return "*" * len(plaintext)
    return f"{'*' * (len(plaintext) - 4)}{plaintext[-4:]}"
