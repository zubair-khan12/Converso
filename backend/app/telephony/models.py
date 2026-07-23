"""Phone numbers mapped to agents. Provider is abstracted (Telnyx initially)."""
from sqlalchemy import Boolean, Column, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from ..base_model import TenantScopedMixin, TimestampMixin, _uuid_pk
from sqlalchemy.orm import relationship

from ..database import Base


class PhoneNumber(TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "phone_numbers"

    id = _uuid_pk()
    agent_id = Column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Provider abstraction: keep the provider name + its own id for the number.
    provider = Column(String(64), nullable=False, default="telnyx")
    provider_number_id = Column(String(255), nullable=True)
    e164 = Column(String(20), nullable=False, unique=True, index=True)

    is_active = Column(Boolean, nullable=False, default=True)

    tenant = relationship("Tenant", backref="phone_numbers")
    agent = relationship("Agent", backref="phone_numbers")

    def __repr__(self):
        return f"<PhoneNumber {self.e164} ({self.provider})>"
