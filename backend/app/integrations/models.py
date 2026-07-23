"""Per-tenant third-party integrations (e.g. Cal.com for meeting booking)."""
from sqlalchemy import Boolean, Column, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB

from ..base_model import TenantScopedMixin, TimestampMixin, _uuid_pk
from sqlalchemy.orm import relationship

from ..database import Base


class Integration(TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "integrations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "provider", name="uq_integration_tenant_provider"),
    )

    id = _uuid_pk()
    # 'calcom', and future providers.
    provider = Column(String(64), nullable=False)
    # Credentials (API keys, etc.). Should be encrypted at rest before prod.
    credentials = Column(JSONB, nullable=False, default=dict)
    config = Column(JSONB, nullable=False, default=dict)
    is_active = Column(Boolean, nullable=False, default=True)

    tenant = relationship("Tenant", backref="integrations")

    def __repr__(self):
        return f"<Integration {self.provider}>"
