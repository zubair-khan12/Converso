"""Call records: conversations, their messages, and tool executions."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from ..base_model import TenantScopedMixin, TimestampMixin, _uuid_pk
from sqlalchemy.orm import relationship

from ..database import Base


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
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)

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
