"""GET /api/dashboard/summary — the numbers on the dashboard home.

Every query is scoped to the tenant from the verified JWT, never a client-
supplied id. One endpoint rather than five so the dashboard is a single
round-trip, and so "0 calls" and "no data yet" stay distinguishable: counts are
always real numbers, and the frontend decides how to phrase an empty one.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from ..agents.models import Agent
from ..conversations.models import Conversation
from ..database import get_db
from ..deps import get_current_claims
from ..knowledge.models import Document
from ..telephony.models import PhoneNumber

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

RECENT_CALL_LIMIT = 5


def _month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


@router.get("/summary")
def summary(
    claims: dict = Depends(get_current_claims), db: Session = Depends(get_db)
):
    tenant_id = claims["tenant_id"]
    now = datetime.now(timezone.utc)
    since_month = _month_start(now)
    since_week = now - timedelta(days=7)

    # Call stats mean *phone* calls. Chat sessions live in the same table, so
    # every rollup below is explicitly voice-only — otherwise opening the chat
    # panel would silently inflate "total calls" and "minutes".
    voice = (Conversation.tenant_id == tenant_id, Conversation.channel == "voice")
    calls = db.query(Conversation).filter(*voice)

    # A single grouped pass for the call rollups — four separate COUNT queries
    # would scan the same rows four times.
    totals = (
        db.query(
            func.count(Conversation.id),
            func.coalesce(func.sum(Conversation.duration_seconds), 0),
            func.count(distinct(Conversation.caller_number)),
            func.coalesce(func.sum(Conversation.cost_usd), 0),
        )
        .filter(*voice)
        .one()
    )
    total_calls, total_seconds, unique_callers, total_cost = totals

    month = (
        db.query(
            func.count(Conversation.id),
            func.coalesce(func.sum(Conversation.duration_seconds), 0),
        )
        .filter(*voice, Conversation.started_at >= since_month)
        .one()
    )
    month_calls, month_seconds = month

    week_calls = calls.filter(Conversation.started_at >= since_week).count()
    active_calls = calls.filter(Conversation.status == "active").count()
    failed_calls = calls.filter(Conversation.status == "failed").count()

    chats = db.query(Conversation).filter(
        Conversation.tenant_id == tenant_id, Conversation.channel == "chat"
    )
    total_chats = chats.count()
    month_chats = chats.filter(Conversation.started_at >= since_month).count()

    recent = (
        db.query(Conversation)
        .filter(*voice)
        .order_by(
            # New rows may not have started_at yet (created by a RAG turn before
            # the first status-update), so fall back to insertion order.
            func.coalesce(Conversation.started_at, Conversation.created_at).desc()
        )
        .limit(RECENT_CALL_LIMIT)
        .all()
    )

    agents = db.query(Agent).filter(Agent.tenant_id == tenant_id)
    numbers = db.query(PhoneNumber).filter(PhoneNumber.tenant_id == tenant_id)
    documents = db.query(Document).filter(Document.tenant_id == tenant_id)

    return {
        "agents": {
            "total": agents.count(),
            "ready": agents.filter(Agent.provisioning_status == "ready").count(),
        },
        "phone_numbers": {
            "total": numbers.count(),
            "attached": numbers.filter(PhoneNumber.agent_id.isnot(None)).count(),
        },
        "documents": {
            "total": documents.count(),
            "ready": documents.filter(Document.status == "ready").count(),
        },
        "calls": {
            "total": total_calls,
            "this_month": month_calls,
            "last_7_days": week_calls,
            "in_progress": active_calls,
            "failed": failed_calls,
        },
        "chats": {"total": total_chats, "this_month": month_chats},
        "minutes": {
            # Rounded for display; the raw seconds stay in the DB.
            "total": round(int(total_seconds) / 60, 1),
            "this_month": round(int(month_seconds) / 60, 1),
        },
        "unique_callers": unique_callers,
        "avg_duration_seconds": (
            round(int(total_seconds) / total_calls) if total_calls else 0
        ),
        "total_cost_usd": float(total_cost or 0),
        "recent_calls": [_call_public(c) for c in recent],
    }


def _call_public(conv: Conversation) -> dict:
    return {
        "id": str(conv.id),
        "agent_name": conv.agent.name if conv.agent else None,
        "caller_number": conv.caller_number,
        "direction": conv.direction,
        "status": conv.status,
        "ended_reason": conv.ended_reason,
        "duration_seconds": conv.duration_seconds,
        "started_at": conv.started_at.isoformat() if conv.started_at else None,
    }
