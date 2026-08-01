"""Phone numbers, routed to an agent for inbound calls.

Every number — regardless of underlying carrier (Vapi-native, Twilio, Telnyx)
— is provisioned and managed through Vapi's own `/phone-number` API, mirroring
how `Agent` is a local row kept in sync with a Vapi assistant. See §Vapi's
phone-number API in the phone-numbers plan for the exact contract.
"""
from sqlalchemy import Boolean, Column, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID

from ..base_model import TenantScopedMixin, TimestampMixin, _uuid_pk
from sqlalchemy.orm import relationship

from ..database import Base

# Provisioning lifecycle, mirroring Agent's pattern:
#   pending → local row exists, Vapi hasn't confirmed the number yet
#   ready   → live on Vapi, vapi_phone_number_id set (and e164 known)
#   failed  → the Vapi call failed; provisioning_error explains why, retry-able
PROVISIONING_STATUSES = ("pending", "ready", "failed")

TELEPHONY_PROVIDERS = ("vapi", "twilio", "telnyx")


class PhoneNumber(TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "phone_numbers"

    id = _uuid_pk()
    agent_id = Column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Underlying carrier: "vapi" (Vapi provisions it directly), "twilio",
    # or "telnyx" (both bring-your-own, imported via the tenant's own
    # Integration credentials).
    provider = Column(String(64), nullable=False, default="vapi")
    # Vapi's id for this phone-number resource — always set once provisioned,
    # regardless of carrier (this is what we PATCH/DELETE against on Vapi).
    vapi_phone_number_id = Column(String(255), nullable=True, index=True)
    # Nullable: for a Vapi-native number, the actual E.164 number isn't known
    # until Vapi's create call responds, so the row briefly exists as
    # "pending" with no number yet — same pattern as Agent.vapi_assistant_id.
    e164 = Column(String(20), nullable=True, unique=True, index=True)

    provisioning_status = Column(String(32), nullable=False, default="pending", index=True)
    provisioning_error = Column(Text, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True)

    tenant = relationship("Tenant", backref="phone_numbers")
    agent = relationship("Agent", backref="phone_numbers")

    def __repr__(self):
        return f"<PhoneNumber {self.e164 or '(pending)'} ({self.provider}) [{self.provisioning_status}]>"
