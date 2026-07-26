"""Voice agents — the configurable unit a caller talks to."""
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


class Agent(TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "agents"

    id = _uuid_pk()
    name = Column(String(255), nullable=False)
    base_prompt = Column(Text, nullable=False, default="")
    # The chosen voice id (currently always a built-in Vapi voice).
    voice = Column(String(120), nullable=True)
    # Misc model configuration: temperature, model provider/name.
    config = Column(JSONB, nullable=False, default=dict)

    # Handle to the assistant created on the Vapi side.
    vapi_assistant_id = Column(String(255), nullable=True, index=True)

    # Whether the two sides are in sync, and why not if they aren't.
    provisioning_status = Column(String(32), nullable=False, default="pending", index=True)
    provisioning_error = Column(Text, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True)

    tenant = relationship("Tenant", backref="agents")

    def __repr__(self):
        return f"<Agent {self.name} [{self.provisioning_status}]>"
