"""Knowledge base document management, scoped to one agent.

Adding a source (pasted text or an uploaded PDF/txt) only extracts + stores its
text — nothing is embedded until the tenant clicks "Train agent"
(`POST /api/agents/{id}/train`). These endpoints are all JWT-gated and
tenant-scoped; the agent is always verified to belong to the caller's tenant.
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..agents.models import Agent
from ..database import get_db
from ..deps import get_current_claims
from . import service

router = APIRouter(prefix="/api/agents/{agent_id}/documents", tags=["knowledge"])

# Guard against someone uploading a huge file to a synchronous endpoint.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


class AddTextRequest(BaseModel):
    title: str = ""
    text: str


def _require_agent(db: Session, tenant_id: str, agent_id: str) -> Agent:
    agent = (
        db.query(Agent)
        .filter(Agent.id == agent_id, Agent.tenant_id == tenant_id)
        .first()
    )
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found.")
    return agent


@router.get("")
def list_documents(
    agent_id: str,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    tenant_id = claims["tenant_id"]
    _require_agent(db, tenant_id, agent_id)
    docs = service.list_documents(db, tenant_id, agent_id)
    return {"documents": [service.document_public(d) for d in docs]}


@router.post("/text", status_code=201)
def add_text(
    agent_id: str,
    body: AddTextRequest,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    tenant_id = claims["tenant_id"]
    _require_agent(db, tenant_id, agent_id)
    try:
        doc = service.add_text_source(
            db, tenant_id, agent_id, title=body.title, text=body.text
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return service.document_public(doc)


@router.post("/file", status_code=201)
async def add_file(
    agent_id: str,
    file: UploadFile = File(...),
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    tenant_id = claims["tenant_id"]
    _require_agent(db, tenant_id, agent_id)

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File is too large (max 10 MB).")

    try:
        doc = service.add_file_source(
            db,
            tenant_id,
            agent_id,
            filename=file.filename or "upload",
            mime_type=file.content_type,
            data=data,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return service.document_public(doc)


@router.delete("/{document_id}", status_code=200)
def delete_document(
    agent_id: str,
    document_id: str,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    tenant_id = claims["tenant_id"]
    _require_agent(db, tenant_id, agent_id)
    if not service.delete_document(db, tenant_id, agent_id, document_id):
        raise HTTPException(status_code=404, detail="Document not found.")
    return {"deleted": True, "id": document_id}
