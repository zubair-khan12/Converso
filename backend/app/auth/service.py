"""Auth helpers: password checking and JWT encode/decode.

Tokens are signed with the app SECRET_KEY (HS256). The token is the single
source of identity — it carries the tenant so downstream requests never trust a
tenant_id sent by the client.
"""
from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from werkzeug.security import check_password_hash

from ..config import settings
from .models import User

# How long an access token stays valid.
TOKEN_TTL = timedelta(days=7)
ALGORITHM = "HS256"


def authenticate(db: Session, email: str, password: str) -> User | None:
    """Return the active user matching these credentials, or None."""
    if not email or not password:
        return None
    user = db.execute(
        select(User).where(func.lower(User.email) == email.strip().lower())
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        return None
    if not check_password_hash(user.password_hash, password):
        return None
    return user


def create_access_token(user: User) -> tuple[str, int]:
    """Sign a JWT for this user. Returns (token, expires_in_seconds)."""
    now = datetime.now(timezone.utc)
    exp = now + TOKEN_TTL
    payload = {
        "sub": str(user.id),
        "tenant_id": str(user.tenant_id),
        "email": user.email,
        "role": user.role,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)
    return token, int(TOKEN_TTL.total_seconds())


def decode_access_token(token: str) -> dict | None:
    """Verify a token's signature and expiry. Returns claims, or None if invalid."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
