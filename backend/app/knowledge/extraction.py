"""Turn an uploaded knowledge source into plain text.

Scope is deliberately small — the UI only allows pasted text and PDF uploads,
so we support exactly those. Raw bytes are never persisted (no object storage
yet); we extract text here, chunk + embed it, and keep only the chunks.
"""
import io

from pypdf import PdfReader

# What the UI is allowed to send. Kept here so the router and the frontend
# agree on one list.
TEXT_MIME_TYPES = {"text/plain", "text/markdown", ""}
PDF_MIME_TYPES = {"application/pdf"}


class ExtractionError(Exception):
    """We couldn't get usable text out of an upload."""


def extract_text(*, filename: str, mime_type: str | None, data: bytes) -> str:
    """Extract plain text from an uploaded file's bytes.

    Routing is by mime type first, falling back to the filename extension so a
    browser that omits/guesses the type (common for .md) still works.
    """
    mime = (mime_type or "").lower()
    name = (filename or "").lower()

    if mime in PDF_MIME_TYPES or name.endswith(".pdf"):
        return _extract_pdf(data)
    if mime in TEXT_MIME_TYPES or name.endswith((".txt", ".md")):
        return _decode_text(data)

    raise ExtractionError(
        f"Unsupported file type '{mime_type or filename}'. Upload a PDF or a .txt/.md file."
    )


def _decode_text(data: bytes) -> str:
    try:
        return data.decode("utf-8").strip()
    except UnicodeDecodeError:
        # Be forgiving of odd encodings rather than dropping the whole upload.
        return data.decode("utf-8", errors="replace").strip()


def _extract_pdf(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as exc:  # pypdf raises a grab-bag of errors on bad files
        raise ExtractionError(f"Could not read the PDF: {exc}") from exc

    parts = [(page.extract_text() or "").strip() for page in reader.pages]
    text = "\n\n".join(p for p in parts if p).strip()
    if not text:
        raise ExtractionError(
            "No selectable text found in this PDF — it may be a scanned image. "
            "OCR isn't supported yet; paste the text instead."
        )
    return text
