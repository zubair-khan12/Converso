"""Auth API. Consumed server-to-server by the Next.js frontend, which is what
sets the httpOnly cookie — so these endpoints just return/verify the token.
"""
from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .service import authenticate, create_access_token, decode_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


def _claims_public(claims: dict) -> dict:
    return {
        "id": claims["sub"],
        "email": claims["email"],
        "tenant_id": claims["tenant_id"],
        "role": claims["role"],
    }


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
        "user": {
            "id": str(user.id),
            "email": user.email,
            "tenant_id": str(user.tenant_id),
            "role": user.role,
            "name": user.name,
        },
    }


@router.get("/me")
def me(authorization: str | None = Header(default=None)):
    """Verify a bearer token and echo its identity. Used by the frontend to
    validate the session cookie."""
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    claims = decode_access_token(token)
    if claims is None:
        return JSONResponse(
            {"error": "Invalid or expired token."}, status_code=401
        )
    return {"user": _claims_public(claims)}
