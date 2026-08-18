"""Call records: conversations, their messages, and tool executions."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from ..base_model import TenantScopedMixin, TimestampMixin, _uuid_pk
from sqlalchemy.orm import relationship

from ..database import Base

# Lifecycle of a call record. `active` is written the moment we first hear about
# the call (a custom-LLM turn or a Vapi status-update); the rest come from
# Vapi's end-of-call-report.
CONVERSATION_STATUSES = ("active", "completed", "failed")

# Only inbound calls exist today — outbound dialing isn't built — but the column
# means the Call Logs screen doesn't need a migration when it is.
CONVERSATION_DIRECTIONS = ("inbound", "outbound", "web")


class Conversation(TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "conversations"

    id = _uuid_pk()
    agent_id = Column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    phone_number_id = Column(
        UUID(as_uuid=True),
        ForeignKey("phone_numbers.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Vapi's identifier for the call.
    vapi_call_id = Column(String(255), nullable=True, index=True)
    caller_number = Column(String(20), nullable=True)
    status = Column(String(32), nullable=False, default="active")
    direction = Column(String(16), nullable=False, default="inbound")
    # Indexed: every stat on the dashboard is a window over this column.
    started_at = Column(DateTime(timezone=True), nullable=True, index=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    # --- Filled in by Vapi's end-of-call-report webhook ---
    # Seconds, denormalized from started/ended so stats are a plain SUM rather
    # than a per-row date subtraction that skips rows missing either timestamp.
    duration_seconds = Column(Integer, nullable=True)
    # Vapi's own reason string ("customer-ended-call", "assistant-error", …).
    ended_reason = Column(String(64), nullable=True)
    # What Vapi billed for the call. Numeric, not float — money.
    cost_usd = Column(Numeric(10, 4), nullable=True)
    recording_url = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    # Plain-text transcript as Vapi renders it. The structured turn-by-turn
    # version lives in `messages`; this is what the Call Logs screen shows.
    transcript = Column(Text, nullable=True)

    tenant = relationship("Tenant", backref="conversations")
    agent = relationship("Agent", backref="conversations")
    messages = relationship(
        "Message", backref="conversation", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Conversation {self.id} [{self.status}]>"


class Message(TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "messages"

    id = _uuid_pk()
    conversation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # 'user' | 'assistant' | 'system' | 'tool'
    role = Column(String(32), nullable=False)
    content = Column(Text, nullable=True)
    seq = Column(Integer, nullable=False, default=0)

    def __repr__(self):
        return f"<Message {self.role} #{self.seq}>"


class ToolExecution(TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "tool_executions"

    id = _uuid_pk()
    conversation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    message_id = Column(
        UUID(as_uuid=True),
        ForeignKey("messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    # 'knowledge_base_search' | 'meeting_booking'
    tool_name = Column(String(120), nullable=False)
    input = Column(JSONB, nullable=True)
    output = Column(JSONB, nullable=True)
    status = Column(String(32), nullable=False, default="success")
    error = Column(Text, nullable=True)
    latency_ms = Column(Integer, nullable=True)

    def __repr__(self):
        return f"<ToolExecution {self.tool_name} [{self.status}]>"
