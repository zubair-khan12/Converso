"""Internal admin panel (sqladmin).

Operational tool for provisioning users, inspecting tenants and troubleshooting
agents (§9). Intentionally NOT a second product frontend. Mounted at /admin.

NOTE: no authentication yet — a later phase adds admin auth. Keep it bound to
localhost / behind the internal network until then.
"""
from fastapi import FastAPI
from sqladmin import Admin, ModelView
from sqlalchemy.engine import Engine
from sqlalchemy.orm import configure_mappers
from werkzeug.security import generate_password_hash
from wtforms import PasswordField

from ..agents.models import Agent
from ..auth.models import User
from ..conversations.models import Conversation, Message, ToolExecution
from ..integrations.models import Integration
from ..knowledge.models import Document, DocumentChunk
from ..telephony.models import PhoneNumber
from ..tenants.models import Tenant

# Force all relationship backrefs (e.g. DocumentChunk.document, Message.conversation)
# to exist before we reference them in the ModelView class bodies below.
configure_mappers()

# UUID PKs and timestamps are system-managed — keep them out of every form.
_SYSTEM_COLUMNS = ["created_at", "updated_at"]


class TenantAdmin(ModelView, model=Tenant):
    category = "Tenancy"
    name = "Tenant"
    column_list = [Tenant.slug, Tenant.name, Tenant.created_at]
    column_searchable_list = [Tenant.name, Tenant.slug]
    column_sortable_list = [Tenant.slug, Tenant.created_at]
    form_excluded_columns = _SYSTEM_COLUMNS


class UserAdmin(ModelView, model=User):
    """Provision users here. Password is entered plain and hashed on save."""

    category = "Tenancy"
    name = "User"
    column_list = [User.email, User.name, User.role, User.is_active, User.tenant]
    column_searchable_list = [User.email, User.name]
    column_sortable_list = [User.email, User.created_at]
    # Never expose the hash in forms; a write-only plaintext field replaces it.
    form_excluded_columns = ["password_hash", *_SYSTEM_COLUMNS]

    async def scaffold_form(self, rules=None):
        form_class = await super().scaffold_form(rules)

        class UserForm(form_class):  # type: ignore[valid-type, misc]
            new_password = PasswordField("Set password")

        return UserForm

    async def on_model_change(self, data, model, is_created, request):
        # Pop the virtual field so it is never treated as a model column.
        pw = data.pop("new_password", None)
        if pw:
            model.password_hash = generate_password_hash(pw)
        if is_created and not getattr(model, "password_hash", None):
            raise ValueError("A password is required when creating a user.")


class AgentAdmin(ModelView, model=Agent):
    category = "Agents"
    name = "Agent"
    column_list = [Agent.name, Agent.tenant, Agent.voice, Agent.is_active, Agent.vapi_assistant_id]
    column_searchable_list = [Agent.name]
    form_excluded_columns = _SYSTEM_COLUMNS


class DocumentAdmin(ModelView, model=Document):
    category = "Knowledge"
    name = "Document"
    column_list = [Document.filename, Document.tenant, Document.agent, Document.status, Document.mime_type, Document.size_bytes]
    column_searchable_list = [Document.filename]
    column_sortable_list = [Document.status, Document.created_at]
    form_excluded_columns = _SYSTEM_COLUMNS


class DocumentChunkAdmin(ModelView, model=DocumentChunk):
    category = "Knowledge"
    name = "Document Chunk"
    name_plural = "Document Chunks"
    # The embedding is a 1536-d vector — never render or edit it in the UI.
    # (DocumentChunk has no `agent` relationship, only the denormalized agent_id.)
    column_list = [DocumentChunk.document, DocumentChunk.chunk_index, DocumentChunk.token_count]
    column_details_exclude_list = [DocumentChunk.embedding]
    form_excluded_columns = ["embedding", *_SYSTEM_COLUMNS]


class PhoneNumberAdmin(ModelView, model=PhoneNumber):
    category = "Telephony"
    name = "Phone Number"
    column_list = [PhoneNumber.e164, PhoneNumber.tenant, PhoneNumber.agent, PhoneNumber.provider, PhoneNumber.is_active]
    column_searchable_list = [PhoneNumber.e164]
    form_excluded_columns = _SYSTEM_COLUMNS


class IntegrationAdmin(ModelView, model=Integration):
    category = "Integrations"
    name = "Integration"
    column_list = [Integration.provider, Integration.tenant, Integration.is_active]
    form_excluded_columns = _SYSTEM_COLUMNS


class ConversationAdmin(ModelView, model=Conversation):
    category = "Calls"
    name = "Conversation"
    column_list = [Conversation.id, Conversation.tenant, Conversation.agent, Conversation.caller_number, Conversation.status, Conversation.started_at, Conversation.ended_at]
    form_excluded_columns = _SYSTEM_COLUMNS


class MessageAdmin(ModelView, model=Message):
    category = "Calls"
    name = "Message"
    column_list = [Message.conversation, Message.role, Message.seq, Message.created_at]
    form_excluded_columns = _SYSTEM_COLUMNS


class ToolExecutionAdmin(ModelView, model=ToolExecution):
    category = "Calls"
    name = "Tool Execution"
    column_list = [ToolExecution.tool_name, ToolExecution.conversation_id, ToolExecution.status, ToolExecution.latency_ms]
    form_excluded_columns = _SYSTEM_COLUMNS


_VIEWS = [
    TenantAdmin,
    UserAdmin,
    AgentAdmin,
    DocumentAdmin,
    DocumentChunkAdmin,
    PhoneNumberAdmin,
    IntegrationAdmin,
    ConversationAdmin,
    MessageAdmin,
    ToolExecutionAdmin,
]


def init_admin(app: FastAPI, engine: Engine) -> Admin:
    admin = Admin(app, engine, title="Voice AI — Internal Admin")
    for view in _VIEWS:
        admin.add_view(view)
    return admin
