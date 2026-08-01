"""Platform staff who can sign in to the internal admin panel.

Deliberately **not** `TenantScopedMixin`: an admin operates across every tenant,
so tying them to one would be wrong. This is also why a tenant's `User` with
`role="owner"` is *not* an admin — owning an Acme account must never grant
access to Beta Corp's data. The two identities are separate on purpose.
"""
from sqlalchemy import Boolean, Column, DateTime, String, UniqueConstraint

from ..base_model import TimestampMixin, _uuid_pk
from ..database import Base


class AdminUser(TimestampMixin, Base):
    __tablename__ = "admin_users"
    __table_args__ = (UniqueConstraint("email", name="uq_admin_users_email"),)

    id = _uuid_pk()
    email = Column(String(255), nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=True)
    # Deactivate rather than delete, so an ex-admin's actions stay attributable
    # and access can be restored without recreating the account.
    is_active = Column(Boolean, nullable=False, default=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<AdminUser {self.email}>"
