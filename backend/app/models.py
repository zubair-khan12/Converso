"""Single import point for all ORM models.

Importing this module registers every table on the shared metadata, which is
what Flask-Migrate/Alembic autogenerate relies on to detect the full schema.
"""
from .admin.models import AdminUser  # noqa: F401
from .agents.models import Agent  # noqa: F401
from .auth.models import User  # noqa: F401
from .conversations.models import Conversation, Message, ToolExecution  # noqa: F401
from .integrations.models import Integration  # noqa: F401
from .knowledge.models import Document, DocumentChunk  # noqa: F401
from .telephony.models import PhoneNumber  # noqa: F401
from .tenants.models import Tenant  # noqa: F401

__all__ = [
    "Tenant",
    "User",
    "AdminUser",
    "Agent",
    "Document",
    "DocumentChunk",
    "PhoneNumber",
    "Integration",
    "Conversation",
    "Message",
    "ToolExecution",
]
