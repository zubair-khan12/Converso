"""Agents — the configurable unit a customer talks to, by phone or by chat."""
from sqlalchemy import Boolean, Column, String, Text
from sqlalchemy.dialects.postgresql import JSONB

from ..base_model import TenantScopedMixin, TimestampMixin, _uuid_pk
from sqlalchemy.orm import relationship

from ..database import Base

# Provisioning lifecycle, mirroring the Document status pattern:
#   pending → we have a local row but Vapi hasn't confirmed the assistant yet
#   ready   → the Vapi assistant exists and vapi_assistant_id is set
#   failed  → the Vapi call failed; provisioning_error explains why, retry-able
PROVISIONING_STATUSES = ("pending", "ready", "failed")

# What an agent talks over. Both kinds are the same row and share the same
# LangGraph brain, knowledge base and Cal.com scheduling — they differ only in
# transport: a `voice` agent is mirrored to a Vapi assistant and reached by
# phone, a `chat` agent has no Vapi side at all and is reached over HTTP.
AGENT_KINDS = ("voice", "chat")


class Agent(TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "agents"

    id = _uuid_pk()
    name = Column(String(255), nullable=False)
    kind = Column(String(16), nullable=False, default="voice", index=True)
    base_prompt = Column(Text, nullable=False, default="")
    # The chosen voice id (currently always a built-in Vapi voice). Always null
    # for a chat agent.
    voice = Column(String(120), nullable=True)
    # Misc model configuration: temperature, model provider/name.
    config = Column(JSONB, nullable=False, default=dict)

    # Handle to the assistant created on the Vapi side.
    vapi_assistant_id = Column(String(255), nullable=True, index=True)

    # Whether the two sides are in sync, and why not if they aren't.
    provisioning_status = Column(String(32), nullable=False, default="pending", index=True)
    provisioning_error = Column(Text, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True)

    # --- Public website widget ---
    # The capability token in the embed snippet. Unguessable and rotatable: it
    # is visible in the page source of any site that embeds the agent, so it is
    # deliberately NOT the agent's UUID — leaking it must not expose an id used
    # anywhere else, and rotating it must not break the rest of the system.
    public_token = Column(String(64), nullable=True, unique=True, index=True)
    widget_enabled = Column(Boolean, nullable=False, default=False)
    # Origins allowed to embed this agent, e.g. ["https://acme.com"]. Empty
    # means nothing may embed it: the widget spends the *platform* OpenAI key,
    # so "no list yet" has to fail closed, never "allow everyone".
    allowed_origins = Column(JSONB, nullable=False, default=list)

    tenant = relationship("Tenant", backref="agents")

    def __repr__(self):
        return f"<Agent {self.name} [{self.provisioning_status}]>"
