"""Shared SQLAlchemy base mixins used across all domain models."""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declared_attr


def _uuid_pk():
    return Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    """created_at / updated_at columns maintained by the DB and ORM."""

    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class TenantScopedMixin:
    """Every customer-owned table carries a non-null tenant_id (§8).

    Authorization derives tenant context from the authenticated user; the
    frontend never supplies tenant_id directly.
    """

    @declared_attr
    def tenant_id(cls):
        return Column(
            UUID(as_uuid=True),
            ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
