"""Auth helpers: password checking and JWT encode/decode.

Tokens are signed with the app SECRET_KEY (HS256). The token is the single
source of identity — it carries the tenant so downstream requests never trust a
tenant_id sent by the client.
"""
import re
from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from werkzeug.security import check_password_hash, generate_password_hash

from ..config import settings
from ..tenants.service import create_tenant
from .models import User

# How long an access token stays valid.
TOKEN_TTL = timedelta(days=7)
ALGORITHM = "HS256"

MIN_PASSWORD_LENGTH = 8

# Deliberately permissive. Real addresses are validated by mail actually
# arriving, not by a regex; the job here is to catch a typo like a missing "@"
# before it becomes an account nobody can recover.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SignupError(ValueError):
    """A signup the customer can fix — the message is shown to them verbatim."""


def find_user_by_email(db: Session, email: str) -> User | None:
    return db.execute(
        select(User).where(func.lower(User.email) == email.strip().lower())
    ).scalar_one_or_none()


def create_signup(
    db: Session, *, name: str, email: str, password: str, organization: str
) -> User:
    """Create an organisation and its owner in one transaction.

    Self-signup always creates a *new* tenant rather than joining an existing
    one: organisation names aren't unique or verified, so matching on one would
    let anybody request their way into someone else's workspace. Joining an
    existing tenant is what invites are for.

    Raises SignupError with a customer-facing message; commits on success.
    """
    name = (name or "").strip()
    email = (email or "").strip().lower()
    organization = (organization or "").strip()

    if not organization:
        raise SignupError("Please enter your organization's name.")
    if not name:
        raise SignupError("Please enter your name.")
    if not _EMAIL_RE.match(email):
        raise SignupError("Please enter a valid email address.")
    if len(password or "") < MIN_PASSWORD_LENGTH:
        raise SignupError(
            f"Please choose a password of at least {MIN_PASSWORD_LENGTH} characters."
        )
    if find_user_by_email(db, email) is not None:
        # Email is globally unique, so this is genuinely taken — unlike login,
        # there's no point being vague: the customer must know to sign in
        # instead, and they can discover the same fact from the login form.
        raise SignupError(
            "An account with this email already exists. Try signing in instead."
        )

    try:
        tenant = create_tenant(db, organization, source="signup")
        user = User(
            tenant_id=tenant.id,
            email=email,
            password_hash=generate_password_hash(password),
            name=name,
            # The person who creates the organisation owns it.
            role="owner",
            is_active=True,
            # False is what puts them through the getting-started tour. Users
            # provisioned by staff are created with it already True, so the
            # tour is only ever shown to someone who signed themselves up.
            onboarded=False,
        )
        db.add(user)
        db.commit()
    except Exception:
        # Never leave a tenant with no owner behind.
        db.rollback()
        raise

    db.refresh(user)
    return user


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
