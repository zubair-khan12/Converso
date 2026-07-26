"""Vapi-facing helper endpoints for the frontend."""
from fastapi import APIRouter, Depends

from ..deps import get_current_claims
from .client import VOICE_PROVIDER, VOICES

router = APIRouter(prefix="/api/vapi", tags=["vapi"])


@router.get("/voices")
def list_voices(claims: dict = Depends(get_current_claims)):
    """The catalog of built-in voices an agent can use. Static — Vapi has no
    list-voices API — but auth-gated so it lives with the rest of the app."""
    return {"provider": VOICE_PROVIDER, "voices": VOICES}
