"""Knowledge sources: uploaded documents and their embedded chunks.

MVP processing is synchronous and manually triggered from the UI, tracked by
the status field (processing / ready / failed). See §6.
"""
from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from ..base_model import TenantScopedMixin, TimestampMixin, _uuid_pk
from sqlalchemy.orm import relationship

from ..database import Base

# Fixed vector dimension for the embedding column. Must match EMBEDDING_DIM in
# config and the model used to generate embeddings (1536 = OpenAI text-embedding-3-small).
EMBEDDING_DIM = 1536

DOCUMENT_STATUSES = ("processing", "ready", "failed")


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

    status = Column(String(32), nullable=False, default="processing", index=True)
    error = Column(Text, nullable=True)

    tenant = relationship("Tenant", backref="documents")
    agent = relationship("Agent", backref="documents")
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
