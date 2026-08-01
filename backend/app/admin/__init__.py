"""Internal admin panel (sqladmin).

Operational tool for provisioning users, inspecting tenants and troubleshooting
agents (§9). Intentionally NOT a second product frontend. Mounted at /admin.

Sign-in is required (`auth.AdminAuth`, backed by the `admin_users` table).
Admins are platform staff and see **every tenant's data**, so this is the most
privileged surface in the system — treat an admin account accordingly.
"""
from fastapi import FastAPI
from sqladmin import Admin, ModelView
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.engine import Engine
from sqlalchemy.orm import configure_mappers
from werkzeug.security import generate_password_hash
from wtforms import PasswordField

from ..agents.models import Agent
from ..auth.models import User
from ..conversations.models import Conversation, Message, ToolExecution
from ..integrations.models import Integration
from ..knowledge.models import Document, DocumentChunk
from ..config import DEV_SECRET_KEY, settings
from ..telephony.models import PhoneNumber
from ..tenants.models import Tenant
from .auth import SESSION_MAX_AGE, AdminAuth
from .models import AdminUser

# Force all relationship backrefs (e.g. DocumentChunk.document, Message.conversation)
# to exist before we reference them in the ModelView class bodies below.
configure_mappers()

# UUID PKs and timestamps are system-managed — keep them out of every form.
_SYSTEM_COLUMNS = ["created_at", "updated_at"]


def _form_excludes(model, *extra: str) -> list[str]:
    """System columns, plus every one-to-many collection on `model`.

    sqladmin scaffolds reverse relationships as multi-selects, which makes
    saving a *parent* mean "these are now its only children". Submitting the
    Tenant form therefore issued `UPDATE agents SET tenant_id=NULL` for every
    agent — only the NOT NULL constraint stopped it, which is what made the
    Tenant page impossible to save at all.

    Ownership belongs on the child side (an Agent picks its Tenant), so these
    collections have no business being editable from the parent. Computed from
    the mapper rather than hard-coded, so a new relationship can't quietly
    reintroduce the same hazard.
    """
    collections = [rel.key for rel in sa_inspect(model).relationships if rel.uselist]
    return [*_SYSTEM_COLUMNS, *collections, *extra]


class TenantAdmin(ModelView, model=Tenant):
    category = "Tenancy"
    name = "Tenant"
    column_list = [Tenant.slug, Tenant.name, Tenant.created_at]
    column_searchable_list = [Tenant.name, Tenant.slug]
    column_sortable_list = [Tenant.slug, Tenant.created_at]
    form_excluded_columns = _form_excludes(Tenant)


class AdminUserAdmin(ModelView, model=AdminUser):
    """Create further admins here — this is how you add colleagues once you can
    already sign in. The very first admin can't be made this way (nobody is
    signed in yet), so it's bootstrapped with `python create_admin.py`.

    Deactivating (`is_active` off) is preferred over deleting: it revokes
    access on the admin's next request, and is reversible.
    """

    category = "Tenancy"
    name = "Admin"
    name_plural = "Admins"
    column_list = [AdminUser.email, AdminUser.name, AdminUser.is_active, AdminUser.last_login_at]
    column_searchable_list = [AdminUser.email, AdminUser.name]
    column_sortable_list = [AdminUser.email, AdminUser.last_login_at]
    # last_login_at is written by the login flow, never typed in.
    form_excluded_columns = _form_excludes(AdminUser, "password_hash", "last_login_at")

    async def scaffold_form(self, rules=None):
        form_class = await super().scaffold_form(rules)

        class AdminUserForm(form_class):  # type: ignore[valid-type, misc]
            new_password = PasswordField("Set password")

        return AdminUserForm

    async def on_model_change(self, data, model, is_created, request):
        pw = data.pop("new_password", None)
        email = (data.get("email") or "").strip().lower()
        if email:
            data["email"] = email  # login lowercases, so storage must match
        if pw:
            if len(pw) < 12:
                raise ValueError("Admin passwords must be at least 12 characters.")
            model.password_hash = generate_password_hash(pw)
        if is_created and not getattr(model, "password_hash", None):
            raise ValueError("A password is required when creating an admin.")


class UserAdmin(ModelView, model=User):
    """Provision users here. Password is entered plain and hashed on save."""

    category = "Tenancy"
    name = "User"
    column_list = [User.email, User.name, User.role, User.is_active, User.tenant]
    column_searchable_list = [User.email, User.name]
    column_sortable_list = [User.email, User.created_at]
    # Never expose the hash in forms; a write-only plaintext field replaces it.
    form_excluded_columns = _form_excludes(User, "password_hash")

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
    form_excluded_columns = _form_excludes(Agent)


class DocumentAdmin(ModelView, model=Document):
    category = "Knowledge"
    name = "Document"
    column_list = [Document.filename, Document.tenant, Document.agent, Document.status, Document.mime_type, Document.size_bytes]
    column_searchable_list = [Document.filename]
    column_sortable_list = [Document.status, Document.created_at]
    form_excluded_columns = _form_excludes(Document)


class DocumentChunkAdmin(ModelView, model=DocumentChunk):
    category = "Knowledge"
    name = "Document Chunk"
    name_plural = "Document Chunks"
    # The embedding is a 1536-d vector — never render or edit it in the UI.
    # (DocumentChunk has no `agent` relationship, only the denormalized agent_id.)
    column_list = [DocumentChunk.document, DocumentChunk.chunk_index, DocumentChunk.token_count]
    column_details_exclude_list = [DocumentChunk.embedding]
    form_excluded_columns = _form_excludes(DocumentChunk, "embedding")


class PhoneNumberAdmin(ModelView, model=PhoneNumber):
    category = "Telephony"
    name = "Phone Number"
    column_list = [PhoneNumber.e164, PhoneNumber.tenant, PhoneNumber.agent, PhoneNumber.provider, PhoneNumber.provisioning_status, PhoneNumber.is_active]
    column_searchable_list = [PhoneNumber.e164]
    form_excluded_columns = _form_excludes(PhoneNumber)


class IntegrationAdmin(ModelView, model=Integration):
    category = "Integrations"
    name = "Integration"
    column_list = [Integration.provider, Integration.tenant, Integration.is_active]
    form_excluded_columns = _form_excludes(Integration)


class ConversationAdmin(ModelView, model=Conversation):
    category = "Calls"
    name = "Conversation"
    column_list = [Conversation.id, Conversation.tenant, Conversation.agent, Conversation.caller_number, Conversation.status, Conversation.started_at, Conversation.ended_at]
    form_excluded_columns = _form_excludes(Conversation)


class MessageAdmin(ModelView, model=Message):
    category = "Calls"
    name = "Message"
    column_list = [Message.conversation, Message.role, Message.seq, Message.created_at]
    form_excluded_columns = _form_excludes(Message)


class ToolExecutionAdmin(ModelView, model=ToolExecution):
    category = "Calls"
    name = "Tool Execution"
    column_list = [ToolExecution.tool_name, ToolExecution.conversation_id, ToolExecution.status, ToolExecution.latency_ms]
    form_excluded_columns = _form_excludes(ToolExecution)


_VIEWS = [
    TenantAdmin,
    UserAdmin,
    AdminUserAdmin,
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
    # The session cookie is signed with SECRET_KEY. Left at its dev default in
    # production, anyone who reads this repo could forge an admin session for
    # every tenant's data — so refuse to start rather than run wide open.
    if settings.is_production and settings.SECRET_KEY == DEV_SECRET_KEY:
        raise RuntimeError(
            "SECRET_KEY is still the development default. Set a strong, unique "
            "SECRET_KEY in the environment before deploying — it signs the "
            "admin session cookie."
        )

    admin = Admin(
        app,
        engine,
        title="Voice AI — Internal Admin",
        authentication_backend=AdminAuth(
            secret_key=settings.SECRET_KEY,
            # Cookie hardening. `https_only` is off locally because dev runs on
            # plain http — otherwise the cookie would silently never be sent.
            max_age=SESSION_MAX_AGE,
            https_only=settings.is_production,
            same_site="lax",
        ),
    )
    for view in _VIEWS:
        admin.add_view(view)
    return admin
