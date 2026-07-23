"""Tenant / workspace — the isolation boundary for all customer-owned data."""
from sqlalchemy import Column, String

from ..base_model import TimestampMixin, _uuid_pk
from ..database import Base


class Tenant(TimestampMixin, Base):
    __tablename__ = "tenants"

    id = _uuid_pk()
    name = Column(String(255), nullable=False)
    slug = Column(String(120), nullable=False, unique=True, index=True)

    def __repr__(self):
        return f"<Tenant {self.slug}>"
