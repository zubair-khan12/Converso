"""Tenant / workspace — the isolation boundary for all customer-owned data.

A tenant is also the **billing** boundary: money is collected outside the
system, so `status` is the switch that decides whether an account may use the
product at all. It lives here rather than on `User` because paying is something
an organisation does, not a person — and because `users.is_active` already
means something different ("does this person still work here?"). Keeping them
separate means offboarding an employee and suspending a customer aren't the
same lever.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String

from ..base_model import TimestampMixin, _uuid_pk
from ..database import Base

# Account lifecycle:
#   active   → may use the product (the default a signup lands in)
#   disabled → locked out; they can still sign in and see why, but every
#              product endpoint refuses and their phone numbers stop routing.
TENANT_STATUSES = ("active", "disabled")

# How a tenant came into existence. Self-signups are the ones worth reviewing
# in the admin panel; provisioned tenants were created by staff already.
TENANT_SOURCES = ("signup", "admin")


class Tenant(TimestampMixin, Base):
    __tablename__ = "tenants"

    id = _uuid_pk()
    name = Column(String(255), nullable=False)
    slug = Column(String(120), nullable=False, unique=True, index=True)

    status = Column(String(32), nullable=False, default="active", index=True)
    source = Column(String(32), nullable=False, default="admin", index=True)

    # Unused by default. When set, the gate treats the account as expired past
    # this instant, so turning signups into time-limited trials later is a
    # matter of stamping this column at signup — not new enforcement code.
    trial_ends_at = Column(DateTime(timezone=True), nullable=True)

    @property
    def trial_expired(self) -> bool:
        if self.trial_ends_at is None:
            return False
        ends = self.trial_ends_at
        # Postgres hands these back tz-aware, but a value set in-process this
        # request may still be naive; treat naive as UTC rather than raising.
        if ends.tzinfo is None:
            ends = ends.replace(tzinfo=timezone.utc)
        return ends <= datetime.now(timezone.utc)

    @property
    def is_enabled(self) -> bool:
        """The single source of truth for 'may this account use the product'."""
        return self.status == "active" and not self.trial_expired

    @property
    def lock_reason(self) -> str | None:
        """Why the account is locked, in words a customer can act on."""
        if self.status != "active":
            return "This account has been disabled."
        if self.trial_expired:
            return "This account's trial period has ended."
        return None

    def __repr__(self):
        return f"<Tenant {self.slug} [{self.status}]>"
