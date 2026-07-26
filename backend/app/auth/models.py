"""Registered users. No public signup — users are provisioned (admin panel)."""
from sqlalchemy import Boolean, Column, String, UniqueConstraint

from ..base_model import TenantScopedMixin, TimestampMixin, _uuid_pk
from sqlalchemy.orm import relationship

from ..database import Base


class User(TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id = _uuid_pk()
    email = Column(String(255), nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=True)
    # Application role within the tenant: 'owner' | 'member'. Platform-level
    # admin access is handled separately by the internal admin panel.
    role = Column(String(32), nullable=False, default="member")
    is_active = Column(Boolean, nullable=False, default=True)
    onboarded = Column(Boolean, nullable=False, default=False)

    tenant = relationship("Tenant", backref="users")

    def __repr__(self):
        return f"<User {self.email}>"
