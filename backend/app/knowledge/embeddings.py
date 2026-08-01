"""OpenAI embeddings (text-embedding-3-small), using the platform key.

One place builds the embedder so the model + dimension stay consistent between
indexing (chunks) and querying (a caller's question) — a mismatch would
silently wreck retrieval. The output dimension MUST equal `settings.EMBEDDING_DIM`
and the `document_chunks.embedding` column size.
"""
from functools import lru_cache

from langchain_openai import OpenAIEmbeddings

from ..config import settings


class EmbeddingConfigError(Exception):
    """The platform OpenAI key isn't configured — can't embed."""


@lru_cache(maxsize=1)
def _embedder() -> OpenAIEmbeddings:
    if not settings.OPENAI_API_KEY:
        raise EmbeddingConfigError(
            "OPENAI_API_KEY is not set — knowledge base embeddings are unavailable."
        )
    return OpenAIEmbeddings(
        model=settings.EMBEDDING_MODEL,
        api_key=settings.OPENAI_API_KEY,
        dimensions=settings.EMBEDDING_DIM,
    )


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of chunk texts (indexing)."""
    if not texts:
        return []
    return _embedder().embed_documents(texts)


def embed_query(text: str) -> list[float]:
    """Embed a single caller query (retrieval)."""
    return _embedder().embed_query(text)
