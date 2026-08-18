"""Voice agent CRUD, kept in sync with the tenant's Vapi account.

Each agent exists in two places: a row here and an assistant on Vapi. Create,
update and delete mirror the change to Vapi; `provisioning_status` records
whether the two are currently in sync, and `POST /{id}/retry` re-pushes local
state to Vapi when they've drifted (e.g. Vapi was briefly unreachable).
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_claims
from ..integrations.service import get_vapi_api_key, get_vapi_public_key
from ..knowledge.service import has_ready_chunks, train_documents
from ..vapi.client import (
    DEFAULT_MODEL,
    DEFAULT_MODEL_PROVIDER,
    DEFAULT_VOICE_ID,
    VOICE_IDS,
    VapiError,
    delete_assistant,
)
from ..widget import service as widget_service
from .models import AGENT_KINDS, Agent
from .provisioning import push_to_vapi

router = APIRouter(prefix="/api/agents", tags=["agents"])


class CreateAgentRequest(BaseModel):
    name: str
    base_prompt: str
    # "voice" (mirrored to a Vapi assistant, reached by phone) or "chat"
    # (no Vapi side; served by our own chat endpoint).
    kind: str = "voice"
    voice_id: str = DEFAULT_VOICE_ID
    temperature: float = Field(default=0.7, ge=0, le=2)
    first_message: str = ""


class WidgetSettingsRequest(BaseModel):
    enabled: bool
    # Whatever the tenant typed; normalized (and junk dropped) server-side.
    allowed_origins: list[str] = []


class UpdateAgentRequest(BaseModel):
    name: str | None = None
    base_prompt: str | None = None
    voice_id: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    first_message: str | None = None


def _agent_public(agent: Agent) -> dict:
    cfg = agent.config or {}
    return {
        "id": str(agent.id),
        "name": agent.name,
        "kind": agent.kind,
        "base_prompt": agent.base_prompt,
        "voice_id": agent.voice,
        "temperature": cfg.get("temperature"),
        "first_message": cfg.get("first_message", ""),
        "model": cfg.get("model"),
        "knowledge_trained": bool(cfg.get("rag_enabled")),
        "provisioning_status": agent.provisioning_status,
        "provisioning_error": agent.provisioning_error,
        "vapi_assistant_id": agent.vapi_assistant_id,
        "is_active": agent.is_active,
        "widget": _widget_public(agent),
        "created_at": agent.created_at.isoformat() if agent.created_at else None,
        "updated_at": agent.updated_at.isoformat() if agent.updated_at else None,
    }


def _widget_public(agent: Agent) -> dict:
    """The embed settings. The token is only meaningful once the widget is on,
    so a disabled widget reports none — nothing to paste, nothing to leak."""
    return {
        "enabled": agent.widget_enabled,
        "public_token": agent.public_token if agent.widget_enabled else None,
        "allowed_origins": agent.allowed_origins or [],
    }


def _vapi_key_for(db: Session, tenant_id: str, kind: str) -> str | None:
    """The tenant's Vapi key, or None for a chat agent — which needs no Vapi
    account at all, so requiring one would block the whole chat feature behind
    an integration it never touches."""
    if kind == "chat":
        return None
    return _require_vapi_key(db, tenant_id)


def _require_vapi_key(db: Session, tenant_id: str) -> str:
    api_key = get_vapi_api_key(db, tenant_id)
    if api_key is None:
        raise HTTPException(
            status_code=400, detail="Connect your Vapi account before managing agents."
        )
    return api_key


def _get_agent_or_404(db: Session, tenant_id: str, agent_id: str) -> Agent:
    agent = (
        db.query(Agent)
        .filter(Agent.id == agent_id, Agent.tenant_id == tenant_id)
        .first()
    )
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found.")
    return agent


@router.get("")
def list_agents(
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    agents = (
        db.query(Agent)
        .filter(Agent.tenant_id == claims["tenant_id"])
        .order_by(Agent.created_at.desc())
        .all()
    )
    return {"agents": [_agent_public(a) for a in agents]}


@router.get("/{agent_id}")
def get_agent(
    agent_id: str,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    agent = _get_agent_or_404(db, claims["tenant_id"], agent_id)
    return _agent_public(agent)


@router.get("/{agent_id}/call")
def get_call_credentials(
    agent_id: str,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    """Credentials the browser needs to start a web test call against this
    agent. The public key is publishable, so it's safe to hand to the client."""
    tenant_id = claims["tenant_id"]
    agent = _get_agent_or_404(db, tenant_id, agent_id)

    if agent.kind == "chat":
        raise HTTPException(
            status_code=400,
            detail="Chat agents are tested from the chat panel, not by phone.",
        )
    if agent.provisioning_status != "ready" or not agent.vapi_assistant_id:
        raise HTTPException(
            status_code=400,
            detail="This agent isn't live on Vapi yet. Fix provisioning before testing.",
        )

    public_key = get_vapi_public_key(db, tenant_id)
    if not public_key:
        raise HTTPException(
            status_code=400,
            detail="Add your Vapi public key under Configure Vapi to test agents by web.",
        )

    return {
        "public_key": public_key,
        "assistant_id": agent.vapi_assistant_id,
        "name": agent.name,
    }


@router.post("", status_code=201)
def create_agent(
    body: CreateAgentRequest,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    tenant_id = claims["tenant_id"]
    if body.kind not in AGENT_KINDS:
        raise HTTPException(status_code=400, detail="Unknown agent kind.")
    is_chat = body.kind == "chat"
    api_key = _vapi_key_for(db, tenant_id, body.kind)

    name = body.name.strip()
    base_prompt = body.base_prompt.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Agent name is required.")
    if not base_prompt:
        raise HTTPException(status_code=400, detail="A base prompt is required.")
    # A chat agent has no voice; ignore whatever the client sent rather than
    # rejecting it, so one shared form can post to one endpoint.
    if not is_chat and body.voice_id not in VOICE_IDS:
        raise HTTPException(status_code=400, detail="Unknown voice.")

    agent = Agent(
        tenant_id=tenant_id,
        name=name,
        kind=body.kind,
        base_prompt=base_prompt,
        voice=None if is_chat else body.voice_id,
        config={
            "temperature": body.temperature,
            "model_provider": DEFAULT_MODEL_PROVIDER,
            "model": DEFAULT_MODEL,
            "first_message": body.first_message.strip(),
        },
        provisioning_status="pending",
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)

    # Provision on Vapi synchronously. A failure leaves a retry-able "failed"
    # agent rather than losing the work the user just entered.
    push_to_vapi(db, agent, api_key)
    db.commit()
    db.refresh(agent)
    return _agent_public(agent)


@router.patch("/{agent_id}")
def update_agent(
    agent_id: str,
    body: UpdateAgentRequest,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    tenant_id = claims["tenant_id"]
    agent = _get_agent_or_404(db, tenant_id, agent_id)
    api_key = _vapi_key_for(db, tenant_id, agent.kind)

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Agent name cannot be empty.")
        agent.name = name
    if body.base_prompt is not None:
        base_prompt = body.base_prompt.strip()
        if not base_prompt:
            raise HTTPException(status_code=400, detail="A base prompt is required.")
        agent.base_prompt = base_prompt
    if body.voice_id is not None and agent.kind != "chat":
        if body.voice_id not in VOICE_IDS:
            raise HTTPException(status_code=400, detail="Unknown voice.")
        agent.voice = body.voice_id
    # Config-held fields: rebuild the dict once so SQLAlchemy sees the change.
    if body.temperature is not None or body.first_message is not None:
        cfg = dict(agent.config or {})
        if body.temperature is not None:
            cfg["temperature"] = body.temperature
        if body.first_message is not None:
            cfg["first_message"] = body.first_message.strip()
        agent.config = cfg

    # Mirror the change to Vapi (creates the assistant if a prior attempt failed).
    push_to_vapi(db, agent, api_key)
    db.commit()
    db.refresh(agent)
    return _agent_public(agent)


@router.post("/{agent_id}/train")
def train_agent(
    agent_id: str,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    """Chunk + embed the agent's knowledge sources into pgvector, then re-push
    the Vapi assistant so it routes calls through the RAG brain (custom-LLM).

    Idempotent: already-embedded sources are skipped, so this is safe to click
    again after adding one more document.
    """
    tenant_id = claims["tenant_id"]
    agent = _get_agent_or_404(db, tenant_id, agent_id)
    api_key = _vapi_key_for(db, tenant_id, agent.kind)

    summary = train_documents(db, tenant_id, str(agent.id))

    # RAG is on iff we actually have searchable chunks. Deleting every source
    # and re-training flips the agent back to the plain built-in model.
    cfg = dict(agent.config or {})
    cfg["rag_enabled"] = has_ready_chunks(db, str(agent.id))
    agent.config = cfg
    db.commit()
    db.refresh(agent)

    # Rebuild on Vapi with the now-correct model (custom-LLM if trained).
    push_to_vapi(db, agent, api_key)
    db.commit()
    db.refresh(agent)

    return {"agent": _agent_public(agent), "training": summary}


@router.delete("/{agent_id}", status_code=200)
def delete_agent(
    agent_id: str,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    tenant_id = claims["tenant_id"]
    agent = _get_agent_or_404(db, tenant_id, agent_id)

    # If it exists on Vapi, remove it there first so we never orphan an
    # assistant. Only delete locally once Vapi confirms (404 counts as gone).
    if agent.vapi_assistant_id:
        api_key = _require_vapi_key(db, tenant_id)
        try:
            delete_assistant(api_key, agent.vapi_assistant_id)
        except VapiError as exc:
            raise HTTPException(
                status_code=502, detail=f"Could not delete on Vapi: {exc.message}"
            )

    db.delete(agent)
    db.commit()
    return {"deleted": True, "id": agent_id}


@router.post("/{agent_id}/retry")
def retry_agent(
    agent_id: str,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    """Re-push local state to Vapi after a failed create/update."""
    tenant_id = claims["tenant_id"]
    agent = _get_agent_or_404(db, tenant_id, agent_id)
    api_key = _vapi_key_for(db, tenant_id, agent.kind)

    push_to_vapi(db, agent, api_key)
    db.commit()
    db.refresh(agent)
    return _agent_public(agent)


@router.put("/{agent_id}/widget")
def set_widget(
    agent_id: str,
    body: WidgetSettingsRequest,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    """Turn the website widget on or off and set which sites may embed it.

    Enabling with no origins is refused rather than quietly allowed: the widget
    spends the platform OpenAI key, so "live but unrestricted" must not be
    something a tenant can reach by leaving a field blank.
    """
    agent = _get_agent_or_404(db, claims["tenant_id"], agent_id)

    origins: list[str] = []
    for raw in body.allowed_origins:
        normalized = widget_service.normalize_origin(raw)
        if normalized is None:
            raise HTTPException(
                status_code=400,
                detail=f"'{raw}' isn't a valid website address. Use a form like https://example.com.",
            )
        if normalized not in origins:
            origins.append(normalized)

    if body.enabled and not origins:
        raise HTTPException(
            status_code=400,
            detail="Add at least one website before turning the widget on.",
        )
    if body.enabled and agent.kind == "voice" and not agent.vapi_assistant_id:
        raise HTTPException(
            status_code=400,
            detail="This agent isn't live on Vapi yet — fix its provisioning first.",
        )

    agent.allowed_origins = origins
    agent.widget_enabled = body.enabled
    # Minted on first enable and kept thereafter, so turning the widget off and
    # on again doesn't silently break every site already embedding it.
    if body.enabled and not agent.public_token:
        agent.public_token = widget_service.new_token()
    db.commit()
    db.refresh(agent)
    return _widget_public(agent)


@router.post("/{agent_id}/widget/rotate")
def rotate_widget_token(
    agent_id: str,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    """Issue a new token, invalidating the old snippet everywhere it's pasted.
    The point of the feature — a token published on a site is one that can leak,
    and the answer to a leak has to be something the tenant can do themselves."""
    agent = _get_agent_or_404(db, claims["tenant_id"], agent_id)
    if not agent.widget_enabled:
        raise HTTPException(status_code=400, detail="Turn the widget on first.")
    agent.public_token = widget_service.new_token()
    db.commit()
    db.refresh(agent)
    return _widget_public(agent)
