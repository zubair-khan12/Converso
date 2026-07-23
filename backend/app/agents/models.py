"""Voice agents — the configurable unit a caller talks to."""
from sqlalchemy import Boolean, Column, String, Text
from sqlalchemy.dialects.postgresql import JSONB

from ..base_model import TenantScopedMixin, TimestampMixin, _uuid_pk
from sqlalchemy.orm import relationship

from ..database import Base


class Agent(TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "agents"

    id = _uuid_pk()
    name = Column(String(255), nullable=False)
    base_prompt = Column(Text, nullable=False, default="")
    # Voice + misc configuration (provider voice id, temperature, etc.).
    voice = Column(String(120), nullable=True)
    config = Column(JSONB, nullable=False, default=dict)

    # Handle to the assistant created on the Vapi side (Phase 7).
    vapi_assistant_id = Column(String(255), nullable=True, index=True)

    is_active = Column(Boolean, nullable=False, default=True)

    tenant = relationship("Tenant", backref="agents")

    def __repr__(self):
        return f"<Agent {self.name}>"
