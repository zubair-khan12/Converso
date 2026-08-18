"""Call logs — read-only views over what the Vapi webhook recorded.

Two endpoints, both tenant-scoped from the verified JWT:
  - `GET /api/conversations` — the list behind the Call Logs screen. Deliberately
    omits transcript/summary/messages: a few hundred rows of full transcripts is
    a slow page for text nobody has asked to read yet.
  - `GET /api/conversations/{id}` — one call in full, fetched when a row is
    opened.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_claims
from .models import Conversation, Message, ToolExecution

router = APIRouter(prefix="/api/conversations", tags=["conversations"])

MAX_PAGE_SIZE = 100


def _summary_public(conv: Conversation) -> dict:
    """One row in the list. `recording_url` is included so the list can play a
    call inline without a second request."""
    return {
        "id": str(conv.id),
        "agent_id": str(conv.agent_id) if conv.agent_id else None,
        "agent_name": conv.agent.name if conv.agent else None,
        "caller_number": conv.caller_number,
        "direction": conv.direction,
        "channel": conv.channel,
        "status": conv.status,
        "ended_reason": conv.ended_reason,
        "duration_seconds": conv.duration_seconds,
        "cost_usd": float(conv.cost_usd) if conv.cost_usd is not None else None,
        "recording_url": conv.recording_url,
        "started_at": conv.started_at.isoformat() if conv.started_at else None,
        "ended_at": conv.ended_at.isoformat() if conv.ended_at else None,
    }


def _detail_public(conv: Conversation, messages: list[Message], tools: list[ToolExecution]) -> dict:
    return {
        **_summary_public(conv),
        "summary": conv.summary,
        "transcript": conv.transcript,
        "messages": [
            {"role": m.role, "content": m.content, "seq": m.seq} for m in messages
        ],
        # What the agent actually did mid-call (knowledge lookups, bookings) —
        # the same trace the console prints, so a call can be explained.
        "tool_executions": [
            {
                "tool_name": t.tool_name,
                "status": t.status,
                "latency_ms": t.latency_ms,
                "input": t.input,
                "output": t.output,
            }
            for t in tools
        ],
    }


@router.get("")
def list_conversations(
    limit: int = Query(default=25, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    agent_id: str | None = None,
    status: str | None = None,
    # Voice and chat share this table; a caller must say which it wants, or it
    # gets both. The Call Logs screen asks for "voice".
    channel: str | None = None,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    tenant_id = claims["tenant_id"]
    query = db.query(Conversation).filter(Conversation.tenant_id == tenant_id)
    if agent_id:
        query = query.filter(Conversation.agent_id == agent_id)
    if status:
        query = query.filter(Conversation.status == status)
    if channel:
        query = query.filter(Conversation.channel == channel)

    total = query.count()
    calls = (
        query.order_by(
            # Rows created by a mid-call brain turn have no started_at yet, so
            # fall back to insertion order rather than sorting them to the end.
            func.coalesce(Conversation.started_at, Conversation.created_at).desc()
        )
        .limit(limit)
        .offset(offset)
        .all()
    )
    return {
        "calls": [_summary_public(c) for c in calls],
        "total": total,
        "has_more": offset + len(calls) < total,
    }


@router.get("/{conversation_id}")
def get_conversation(
    conversation_id: str,
    claims: dict = Depends(get_current_claims),
    db: Session = Depends(get_db),
):
    conv = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.tenant_id == claims["tenant_id"],
        )
        .first()
    )
    if conv is None:
        raise HTTPException(status_code=404, detail="Call not found.")

    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conv.id)
        .order_by(Message.seq)
        .all()
    )
    tools = (
        db.query(ToolExecution)
        .filter(ToolExecution.conversation_id == conv.id)
        .order_by(ToolExecution.created_at)
        .all()
    )
    return _detail_public(conv, messages, tools)
