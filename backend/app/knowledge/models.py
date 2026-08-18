"""Knowledge sources: uploaded documents and their embedded chunks.

MVP processing is synchronous and manually triggered from the UI, tracked by
the status field (processing / ready / failed). See §6.
"""
from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from ..base_model import TenantScopedMixin, TimestampMixin, _uuid_pk
from sqlalchemy.orm import backref, relationship

from ..config import settings
from ..database import Base

# Vector dimension for the embedding column, driven by config so it matches the
# embedding model (text-embedding-3-small = 1536). Changing EMBEDDING_DIM
# requires re-ALTERing this column and re-training.
EMBEDDING_DIM = settings.EMBEDDING_DIM

# Document lifecycle:
#   pending    → uploaded/pasted, text extracted, not embedded yet
#   processing → chunk+embed in progress (during "Train agent")
#   ready      → chunks embedded and searchable
#   failed     → extraction or embedding failed; `error` explains
DOCUMENT_STATUSES = ("pending", "processing", "ready", "failed")


class Document(TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "documents"

    id = _uuid_pk()
    agent_id = Column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filename = Column(String(512), nullable=False)
    # Object key in DigitalOcean Spaces (Phase 4).
    storage_key = Column(String(1024), nullable=True)
    mime_type = Column(String(255), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    # Extracted plain text, kept between upload and "Train agent" so training
    # can (re)chunk + embed without object storage to re-read the raw file.
    extracted_text = Column(Text, nullable=True)

    status = Column(String(32), nullable=False, default="processing", index=True)
    error = Column(Text, nullable=True)

    tenant = relationship("Tenant", backref="documents")
    # passive_deletes: `agent_id` is NOT NULL with ON DELETE CASCADE, so the
    # database removes these rows itself. Without it SQLAlchemy first tries to
    # null the column on delete, and deleting an agent that has any knowledge
    # source fails on the NOT NULL constraint instead.
    agent = relationship(
        "Agent", backref=backref("documents", passive_deletes=True)
    )
    chunks = relationship(
        "DocumentChunk", backref="document", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Document {self.filename} [{self.status}]>"


class DocumentChunk(TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "document_chunks"

    id = _uuid_pk()
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Denormalized for tenant+agent-scoped retrieval without a join (§12).
    agent_id = Column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index = Column(Integer, nullable=False, default=0)
    content = Column(Text, nullable=False)
    token_count = Column(Integer, nullable=True)
    embedding = Column(Vector(EMBEDDING_DIM), nullable=True)

    def __repr__(self):
        return f"<DocumentChunk doc={self.document_id} #{self.chunk_index}>"
