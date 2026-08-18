"""Chat endpoints — the dashboard's chat panel talks to these.

JWT-gated like the rest of the product API, so the tenant comes from the
verified token. There is deliberately no public/unauthenticated variant yet: an
open endpoint runs the platform OpenAI key for anyone who finds the URL, so it
needs a per-agent public token, per-domain CORS and rate limits before it can
exist. Building it here first keeps that decision open.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..agents.models import Agent
from ..conversations.models import Conversation, Message
from ..database import get_db
from ..deps import get_current_claims
from . import service

router = APIRouter(prefix="/api/chat", tags=["chat"])

MAX_MESSAGE_CHARS = 4000


class SendMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    # Omit to start a new session; pass the id returned last time to continue.
    session_id: str | None = None


def _get_chat_agent(db: Session, tenant_id: str, agent_id: str) -> Agent:
    agent = (
        db.query(Agent)
        .filter(Agent.id == agent_id, Agent.tenant_id == tenant_id)
        .first()
    )
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found.")
    if agent.kind != "chat":
        raise HTTPException(
            status_code=400, detail="That agent answers by phone, not by chat."
        )
    return agent


def _get_session(db: Session, tenant_id: str, session_id: str) -> Conversation:
    conv = (
        db.query(Conversation)
        .filter(
            Conversation.id == session_id,
            Conversation.tenant_id == tenant_id,
            Conversation.channel == "chat",
        )
        .first()
    )
    if conv is None:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    return conv


@router.post("/{agent_id}/messages")
async def send_message(
    agent_id: str,
    body: SendMessageRequest,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    """Send one message and get the agent's reply.

    Runs in a worker thread: retrieval, the model call and any Cal.com round
    trips are all blocking, and holding the event loop for them would stall
    every other request on the process.
    """
    tenant_id = claims["tenant_id"]
    agent = _get_chat_agent(db, tenant_id, agent_id)

    if body.session_id:
        conv = _get_session(db, tenant_id, body.session_id)
        if str(conv.agent_id) != str(agent.id):
            raise HTTPException(
                status_code=400, detail="That session belongs to another agent."
            )
    else:
        conv = service.start_session(db, agent)
        db.commit()

    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    result = await run_in_threadpool(service.run_turn, db, agent, conv, message)

    return {
        "session_id": str(conv.id),
        "answer": result.get("answer", ""),
        # The same trace the console prints, so the test panel can show *why*
        # an answer looked the way it did without opening the logs.
        "trace": {
            "retrieval_ms": result.get("retrieval_ms"),
            "sources": [
                {"filename": c["filename"], "score": c["score"]}
                for c in result.get("chunks", [])
            ],
            "tools": [
                {
                    "tool_name": t["tool_name"],
                    "status": t.get("status", "success"),
                    "latency_ms": t.get("latency_ms"),
                }
                for t in result.get("tool_calls", [])
            ],
        },
    }


@router.get("/sessions/{session_id}")
def get_session(
    session_id: str,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    """Replay a chat session — used when reopening the panel on a session that
    is still open."""
    conv = _get_session(db, claims["tenant_id"], session_id)
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conv.id)
        .order_by(Message.seq)
        .all()
    )
    return {
        "session_id": str(conv.id),
        "agent_id": str(conv.agent_id) if conv.agent_id else None,
        "status": conv.status,
        "messages": [
            {"role": m.role, "content": m.content, "seq": m.seq} for m in messages
        ],
    }


@router.post("/sessions/{session_id}/close")
def close_session(
    session_id: str,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    conv = _get_session(db, claims["tenant_id"], session_id)
    service.close_session(db, conv)
    return {"session_id": str(conv.id), "status": conv.status}
