"""Auth API. Consumed server-to-server by the Next.js frontend, which is what
sets the httpOnly cookie — so these endpoints just return/verify the token.
"""
from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .models import User
from .service import authenticate, create_access_token, decode_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


def _user_public(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "tenant_id": str(user.tenant_id),
        "role": user.role,
        "name": user.name,
        # Drives the post-login redirect: first-timers get the guided tour.
        "onboarded": user.onboarded,
    }


def _bearer_user(authorization: str | None, db: Session) -> User | None:
    """Resolve the bearer token to a live, active user row."""
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    claims = decode_access_token(token)
    if claims is None:
        return None
    user = db.query(User).filter(User.id == claims["sub"]).first()
    if user is None or not user.is_active:
        return None
    return user


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate(db, body.email, body.password)
    if user is None:
        # Deliberately vague — don't reveal whether the email exists.
        return JSONResponse(
            {"error": "Invalid email or password."}, status_code=401
        )

    token, expires_in = create_access_token(user)
    return {
        "token": token,
        "expires_in": expires_in,
        "user": _user_public(user),
    }


@router.get("/me")
def me(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Verify a bearer token and return the current user. Reads the row rather
    than trusting the token's claims, so name/onboarded stay fresh and a
    deactivated user loses access before their token expires."""
    user = _bearer_user(authorization, db)
    if user is None:
        return JSONResponse(
            {"error": "Invalid or expired token."}, status_code=401
        )
    return {"user": _user_public(user)}


@router.post("/onboarded")
def mark_onboarded(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Record that the user has seen the getting-started tour. Idempotent —
    once True it's never flipped back, so the tour never reappears."""
    user = _bearer_user(authorization, db)
    if user is None:
        return JSONResponse(
            {"error": "Invalid or expired token."}, status_code=401
        )
    if not user.onboarded:
        user.onboarded = True
        db.commit()
    return {"user": _user_public(user)}
