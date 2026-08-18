"""Pushing an Agent row to its Vapi assistant.

Lives apart from `agents/router.py` because two very different places need it:
the agents router (create/update/train/retry), and the integrations router —
connecting or disconnecting Cal.com changes whether an assistant needs our
custom-LLM brain at all, so every existing agent has to be re-pushed.
"""
from sqlalchemy.orm import Session

from ..config import settings
from ..integrations.service import calcom_ready
from ..vapi.client import (
    DEFAULT_VOICE_ID,
    VapiError,
    build_assistant_payload,
    create_assistant,
    update_assistant,
)
from .models import Agent


def brain_enabled(db: Session, agent: Agent) -> bool:
    """Whether this agent's turns must run through our LangGraph brain.

    True when it has *either* capability that Vapi's built-in model can't
    provide: an embedded knowledge base (RAG), or Cal.com scheduling (tools we
    execute server-side against the tenant's calendar). Both are per-agent —
    Cal.com is connected once per tenant but linked to one booking agent.
    """
    if (agent.config or {}).get("rag_enabled"):
        return True
    return calcom_ready(db, str(agent.tenant_id), str(agent.id))


def payload_for(db: Session, agent: Agent) -> dict:
    cfg = agent.config or {}
    custom_llm_url = None
    if brain_enabled(db, agent):
        custom_llm_url = f"{settings.public_base_url}/api/vapi/custom-llm/{agent.id}"
    return build_assistant_payload(
        name=agent.name,
        base_prompt=agent.base_prompt,
        voice_id=agent.voice or DEFAULT_VOICE_ID,
        temperature=cfg.get("temperature", 0.7),
        first_message=cfg.get("first_message", ""),
        custom_llm_url=custom_llm_url,
        # Every agent — brain-enabled or not — reports its calls back to us here.
        webhook_url=f"{settings.public_base_url}/api/vapi/webhook/{agent.id}",
    )


def push_to_vapi(db: Session, agent: Agent, api_key: str | None) -> None:
    """Create or update the Vapi assistant to match the local row, recording the
    sync result on the agent. Never raises — status carries the outcome."""
    if agent.kind == "chat":
        # A chat agent has no Vapi side: its turns are served by our own chat
        # endpoint, not routed by Vapi. The guard lives here rather than at each
        # call site so no future caller can accidentally provision one — there
        # is nothing to provision, hence permanently "ready".
        agent.provisioning_status = "ready"
        agent.provisioning_error = None
        return

    payload = payload_for(db, agent)
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


def resync_tenant_agents(db: Session, tenant_id: str, api_key: str) -> int:
    """Re-push every agent that already exists on Vapi, so a tenant-wide change
    (Cal.com connected / disconnected) takes effect on live assistants without
    the tenant editing each agent by hand. Returns how many were re-pushed.

    Agents that were never provisioned are skipped — they'd be created here as a
    side effect of an unrelated action, which isn't what the tenant asked for.
    Commits are the caller's job.
    """
    agents = (
        db.query(Agent)
        .filter(Agent.tenant_id == tenant_id, Agent.vapi_assistant_id.isnot(None))
        .all()
    )
    for agent in agents:
        push_to_vapi(db, agent, api_key)
    return len(agents)
