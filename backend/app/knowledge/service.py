"""Knowledge base operations: add sources, train (chunk + embed), retrieve.

A "source" is a Document (pasted text or an uploaded PDF/txt). Adding one only
extracts + stores its text (`status="pending"`). Training an agent is what
turns pending sources into embedded `DocumentChunk` rows in pgvector — that's
the step the user explicitly triggers with "Train agent".
"""
import time

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from .chunking import chunk_text
from .embeddings import embed_query, embed_texts
from .extraction import ExtractionError, extract_text
from .models import Document, DocumentChunk


def document_public(doc: Document) -> dict:
    return {
        "id": str(doc.id),
        "agent_id": str(doc.agent_id),
        "filename": doc.filename,
        "mime_type": doc.mime_type,
        "size_bytes": doc.size_bytes,
        "status": doc.status,
        "error": doc.error,
        "chunk_count": len(doc.chunks),
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


def list_documents(db: Session, tenant_id: str, agent_id: str) -> list[Document]:
    return (
        db.query(Document)
        .filter(Document.tenant_id == tenant_id, Document.agent_id == agent_id)
        .order_by(Document.created_at.asc())
        .all()
    )


def _enforce_document_quota(db: Session, tenant_id: str) -> None:
    """Cap knowledge sources per tenant.

    Signup is open and unverified, and every source is eventually embedded on
    the *platform* OpenAI key — so without a ceiling, one throwaway account can
    run up an unbounded bill. Counted across the whole tenant rather than
    per-agent, since the cost is the tenant's total either way.
    """
    limit = settings.MAX_DOCUMENTS_PER_TENANT
    if limit <= 0:  # 0 or negative disables the cap
        return
    used = (
        db.query(func.count(Document.id))
        .filter(Document.tenant_id == tenant_id)
        .scalar()
    )
    if used >= limit:
        raise ValueError(
            f"You've reached the limit of {limit} knowledge sources for this "
            f"account. Delete one to add another, or contact us to raise it."
        )


def add_text_source(
    db: Session, tenant_id: str, agent_id: str, *, title: str, text: str
) -> Document:
    """Store pasted text as a pending knowledge source."""
    _enforce_document_quota(db, tenant_id)
    text = text.strip()
    if not text:
        raise ValueError("Text can't be empty.")
    title = (title or "").strip() or "Pasted text"

    doc = Document(
        tenant_id=tenant_id,
        agent_id=agent_id,
        filename=title,
        mime_type="text/plain",
        size_bytes=len(text.encode("utf-8")),
        extracted_text=text,
        status="pending",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def add_file_source(
    db: Session,
    tenant_id: str,
    agent_id: str,
    *,
    filename: str,
    mime_type: str | None,
    data: bytes,
) -> Document:
    """Extract text from an uploaded file and store it as a pending source.

    Extraction happens up front so a bad file is rejected immediately (nothing
    saved) rather than surfacing only at train time.
    """
    _enforce_document_quota(db, tenant_id)
    try:
        text = extract_text(filename=filename, mime_type=mime_type, data=data)
    except ExtractionError as exc:
        raise ValueError(str(exc)) from exc
    if not text.strip():
        raise ValueError("No text could be extracted from this file.")

    doc = Document(
        tenant_id=tenant_id,
        agent_id=agent_id,
        filename=filename,
        mime_type=mime_type,
        size_bytes=len(data),
        extracted_text=text,
        status="pending",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def delete_document(db: Session, tenant_id: str, agent_id: str, doc_id: str) -> bool:
    doc = (
        db.query(Document)
        .filter(
            Document.id == doc_id,
            Document.tenant_id == tenant_id,
            Document.agent_id == agent_id,
        )
        .first()
    )
    if doc is None:
        return False
    db.delete(doc)  # cascade removes its chunks
    db.commit()
    return True


def train_documents(db: Session, tenant_id: str, agent_id: str) -> dict:
    """Chunk + embed every not-yet-ready source for an agent.

    Re-embeds `pending`/`failed`/`processing` docs; already-`ready` docs are
    left untouched so re-training after adding one new file is cheap. Returns a
    summary the UI can show. Raises only on a total failure (e.g. no OpenAI
    key) — per-document errors are recorded on the document, not raised.
    """
    docs = (
        db.query(Document)
        .filter(Document.tenant_id == tenant_id, Document.agent_id == agent_id)
        .all()
    )

    trained, total_chunks, failed = 0, 0, 0
    for doc in docs:
        if doc.status == "ready" and doc.chunks:
            total_chunks += len(doc.chunks)
            continue
        try:
            n = _embed_document(db, doc)
            trained += 1
            total_chunks += n
        except Exception as exc:  # keep going; one bad doc shouldn't block the rest
            doc.status = "failed"
            doc.error = str(exc)[:500]
            db.commit()
            failed += 1

    return {
        "documents_total": len(docs),
        "documents_trained": trained,
        "documents_failed": failed,
        "chunks": total_chunks,
    }


def _embed_document(db: Session, doc: Document) -> int:
    """Chunk + embed a single document, replacing any prior chunks. Returns the
    chunk count. Commits its own progress so status is visible if it crashes."""
    doc.status = "processing"
    doc.error = None
    db.commit()

    text = (doc.extracted_text or "").strip()
    if not text:
        raise ValueError("No stored text to embed — re-upload this source.")

    # Replace prior chunks so re-training is idempotent.
    db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).delete()

    chunks = chunk_text(text)
    if not chunks:
        raise ValueError("Text produced no chunks.")

    vectors = embed_texts(chunks)
    for i, (content, vector) in enumerate(zip(chunks, vectors)):
        db.add(
            DocumentChunk(
                tenant_id=doc.tenant_id,
                document_id=doc.id,
                agent_id=doc.agent_id,
                chunk_index=i,
                content=content,
                embedding=vector,
            )
        )

    doc.status = "ready"
    doc.error = None
    db.commit()
    return len(chunks)


# --- Retrieval (used by the LangGraph agent mid-call) ---


def search_chunks(
    db: Session, agent_id: str, query: str, *, k: int = 4
) -> list[dict]:
    """Nearest chunks to `query` for one agent, by cosine similarity."""
    return search_by_vector(db, agent_id, embed_query(query), k=k)


def search_by_vector(
    db: Session, agent_id: str, qvec: list[float], *, k: int = 4
) -> list[dict]:
    """Nearest chunks to an already-embedded query vector.

    Split from `search_chunks` so the caller (the LangGraph retrieve node) can
    embed once and reuse the vector for the RAG trace. Returns dicts with the
    chunk text, its document filename, and a similarity score
    (1 - cosine distance) — shaped for both the LLM context and the trace.
    """
    distance = DocumentChunk.embedding.cosine_distance(qvec).label("distance")
    rows = (
        db.query(DocumentChunk, distance, Document.filename)
        .join(Document, DocumentChunk.document_id == Document.id)
        .filter(
            DocumentChunk.agent_id == agent_id,
            DocumentChunk.embedding.isnot(None),
        )
        .order_by(distance)
        .limit(k)
        .all()
    )
    return [
        {
            "chunk_id": str(chunk.id),
            "document_id": str(chunk.document_id),
            "filename": filename,
            "chunk_index": chunk.chunk_index,
            "content": chunk.content,
            "score": round(1.0 - float(dist), 4),
        }
        for chunk, dist, filename in rows
    ]


def has_ready_chunks(db: Session, agent_id: str) -> bool:
    """Whether an agent has any embedded chunks to retrieve from."""
    return (
        db.query(DocumentChunk.id)
        .filter(DocumentChunk.agent_id == agent_id)
        .first()
        is not None
    )
