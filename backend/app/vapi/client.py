"""Thin wrapper around Vapi's REST API for assistant provisioning.

Every call takes the tenant's own decrypted Vapi API key — we never use a
platform-wide key, so an agent lives in the same Vapi account the tenant
connected under Configure Vapi.
"""
import httpx

VAPI_API_BASE = "https://api.vapi.ai"

# Defaults for the conversational model. Not user-editable this step — the LLM
# itself is configured inside the tenant's Vapi account; we just point at it.
DEFAULT_MODEL_PROVIDER = "openai"
DEFAULT_MODEL = "gpt-4o-mini"

# Vapi's built-in voices. Vapi exposes no "list voices" API, so this mirrors
# their documented catalog (provider "vapi"). Update here if Vapi changes it.
VOICE_PROVIDER = "vapi"
VOICES: list[dict] = [
    {"voiceId": "Elliot", "name": "Elliot", "gender": "male", "accent": "Canadian"},
    {"voiceId": "Savannah", "name": "Savannah", "gender": "female", "accent": "American"},
    {"voiceId": "Rohan", "name": "Rohan", "gender": "male", "accent": "Indian American"},
    {"voiceId": "Emma", "name": "Emma", "gender": "female", "accent": "Asian American"},
    {"voiceId": "Clara", "name": "Clara", "gender": "female", "accent": "American"},
    {"voiceId": "Nico", "name": "Nico", "gender": "male", "accent": "American"},
    {"voiceId": "Kai", "name": "Kai", "gender": "male", "accent": "American"},
    {"voiceId": "Sagar", "name": "Sagar", "gender": "male", "accent": "Indian American"},
    {"voiceId": "Layla", "name": "Layla", "gender": "female", "accent": "American"},
    {"voiceId": "Naina", "name": "Naina", "gender": "female", "accent": "Indian American"},
]
VOICE_IDS = {v["voiceId"] for v in VOICES}
DEFAULT_VOICE_ID = "Elliot"


class VapiError(Exception):
    """A Vapi API call failed. `status_code` is Vapi's HTTP status if any."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# Things the assistant can say to gracefully hang up on its own.
END_CALL_PHRASES = ["goodbye", "have a great day", "talk to you later", "bye now"]


def build_assistant_payload(
    *,
    name: str,
    base_prompt: str,
    voice_id: str,
    temperature: float,
    first_message: str = "",
    custom_llm_url: str | None = None,
) -> dict:
    """Shape an Agent's config into Vapi's assistant request body.

    When `custom_llm_url` is given (a "trained" agent with a knowledge base),
    the model is a `custom-llm` pointed at that URL, so Vapi routes every turn
    to our LangGraph RAG brain instead of running its own LLM. Otherwise it's a
    plain built-in OpenAI model.
    """
    if custom_llm_url:
        model = {
            "provider": "custom-llm",
            # Vapi appends `/chat/completions` to this base URL.
            "url": custom_llm_url,
            "model": DEFAULT_MODEL,
            "temperature": temperature,
            "messages": [{"role": "system", "content": base_prompt}],
        }
    else:
        model = {
            "provider": DEFAULT_MODEL_PROVIDER,
            "model": DEFAULT_MODEL,
            "temperature": temperature,
            "messages": [{"role": "system", "content": base_prompt}],
        }

    payload = {
        "name": name,
        "model": model,
        "voice": {"provider": VOICE_PROVIDER, "voiceId": voice_id},
        # Let the assistant end the call itself when the caller asks to
        # ("end the call", "I'm done"), and when it says a sign-off phrase.
        "endCallFunctionEnabled": True,
        "endCallPhrases": END_CALL_PHRASES,
        # Spoken the moment the call connects; "" means wait for the caller to
        # speak first. Always sent (even empty) so clearing it stays in sync —
        # Vapi's PATCH is a partial merge and would otherwise keep a stale one.
        "firstMessage": first_message,
    }
    return payload


def _headers(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


def _raise_for_status(resp: httpx.Response, action: str) -> None:
    if resp.status_code < 400:
        return
    detail = ""
    try:
        body = resp.json()
        detail = body.get("message") or body.get("error") or ""
        if isinstance(detail, list):
            detail = "; ".join(str(d) for d in detail)
    except Exception:
        detail = resp.text[:200]
    raise VapiError(
        f"Vapi could not {action} (HTTP {resp.status_code}): {detail}".strip(),
        status_code=resp.status_code,
    )


def create_assistant(api_key: str, payload: dict) -> dict:
    """Create an assistant on Vapi. Returns the created assistant (incl. `id`)."""
    try:
        resp = httpx.post(
            f"{VAPI_API_BASE}/assistant",
            headers=_headers(api_key),
            json=payload,
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise VapiError(f"Could not reach Vapi: {exc}") from exc
    _raise_for_status(resp, "create the assistant")
    return resp.json()


def update_assistant(api_key: str, assistant_id: str, payload: dict) -> dict:
    """Patch an existing Vapi assistant."""
    try:
        resp = httpx.patch(
            f"{VAPI_API_BASE}/assistant/{assistant_id}",
            headers=_headers(api_key),
            json=payload,
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise VapiError(f"Could not reach Vapi: {exc}") from exc
    _raise_for_status(resp, "update the assistant")
    return resp.json()


def delete_assistant(api_key: str, assistant_id: str) -> None:
    """Delete a Vapi assistant. A 404 is treated as success — already gone."""
    try:
        resp = httpx.delete(
            f"{VAPI_API_BASE}/assistant/{assistant_id}",
            headers=_headers(api_key),
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise VapiError(f"Could not reach Vapi: {exc}") from exc
    if resp.status_code == 404:
        return
    _raise_for_status(resp, "delete the assistant")
