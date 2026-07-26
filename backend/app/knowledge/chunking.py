"""Split extracted text into overlapping chunks for embedding + retrieval.

Token-based sizing (via tiktoken) keeps chunks a predictable size for the
embedding model regardless of how "wordy" the source is. Overlap preserves
context that would otherwise be cut mid-thought at a chunk boundary.
"""
from langchain_text_splitters import RecursiveCharacterTextSplitter

# ~500 tokens per chunk with ~75 tokens of overlap. Small enough that a
# retrieved chunk is tightly on-topic, big enough to carry a full idea.
CHUNK_TOKENS = 500
CHUNK_OVERLAP_TOKENS = 75

_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    chunk_size=CHUNK_TOKENS,
    chunk_overlap=CHUNK_OVERLAP_TOKENS,
    # Prefer to break on paragraph/line/sentence boundaries before mid-word.
    separators=["\n\n", "\n", ". ", " ", ""],
)


def chunk_text(text: str) -> list[str]:
    """Return the ordered, non-empty chunks of `text`."""
    return [c.strip() for c in _splitter.split_text(text) if c.strip()]
