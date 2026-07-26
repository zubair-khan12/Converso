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
from ..vapi.client import (
    DEFAULT_MODEL,
    DEFAULT_MODEL_PROVIDER,
    DEFAULT_VOICE_ID,
    VOICE_IDS,
    VapiError,
    build_assistant_payload,
    create_assistant,
    delete_assistant,
    update_assistant,
)
from .models import Agent

router = APIRouter(prefix="/api/agents", tags=["agents"])


class CreateAgentRequest(BaseModel):
    name: str
    base_prompt: str
    voice_id: str = DEFAULT_VOICE_ID
    temperature: float = Field(default=0.7, ge=0, le=2)
    first_message: str = ""


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
        "base_prompt": agent.base_prompt,
        "voice_id": agent.voice,
        "temperature": cfg.get("temperature"),
        "first_message": cfg.get("first_message", ""),
        "model": cfg.get("model"),
        "provisioning_status": agent.provisioning_status,
        "provisioning_error": agent.provisioning_error,
        "vapi_assistant_id": agent.vapi_assistant_id,
        "is_active": agent.is_active,
        "created_at": agent.created_at.isoformat() if agent.created_at else None,
        "updated_at": agent.updated_at.isoformat() if agent.updated_at else None,
    }


def _payload_for(agent: Agent) -> dict:
    cfg = agent.config or {}
    return build_assistant_payload(
        name=agent.name,
        base_prompt=agent.base_prompt,
        voice_id=agent.voice or DEFAULT_VOICE_ID,
        temperature=cfg.get("temperature", 0.7),
        first_message=cfg.get("first_message", ""),
    )


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


def _push_to_vapi(agent: Agent, api_key: str) -> None:
    """Create or update the Vapi assistant to match the local row, recording
    the sync result on the agent. Never raises — status carries the outcome."""
    payload = _payload_for(agent)
    try:
        if agent.vapi_assistant_id:
            update_assistant(api_key, agent.vapi_assistant_id, payload)
        else:
            created = create_assistant(api_key, payload)
            agent.vapi_assistant_id = created.get("id")
        agent.provisioning_status = "ready"
        agent.provisioning_error = None
    except VapiError as exc:
        agent.provisioning_status = "failed"
        agent.provisioning_error = exc.message


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
    api_key = _require_vapi_key(db, tenant_id)

    name = body.name.strip()
    base_prompt = body.base_prompt.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Agent name is required.")
    if not base_prompt:
        raise HTTPException(status_code=400, detail="A base prompt is required.")
    if body.voice_id not in VOICE_IDS:
        raise HTTPException(status_code=400, detail="Unknown voice.")

    agent = Agent(
        tenant_id=tenant_id,
        name=name,
        base_prompt=base_prompt,
        voice=body.voice_id,
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
    _push_to_vapi(agent, api_key)
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
    api_key = _require_vapi_key(db, tenant_id)

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
    if body.voice_id is not None:
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
    _push_to_vapi(agent, api_key)
    db.commit()
    db.refresh(agent)
    return _agent_public(agent)


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
    api_key = _require_vapi_key(db, tenant_id)

    _push_to_vapi(agent, api_key)
    db.commit()
    db.refresh(agent)
    return _agent_public(agent)
