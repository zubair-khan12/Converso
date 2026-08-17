"""Call-log persistence.

Everything we know about a call arrives from Vapi in pieces and out of order: a
custom-LLM turn may land before the first status-update, and the
end-of-call-report can arrive after the call row already exists. So every write
here is an **upsert keyed on (tenant_id, vapi_call_id)** and only fills fields
it actually has — never blanking one Vapi omitted from a later message.
"""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..agents.models import Agent
from .models import Conversation, Message

# Vapi ended-reason strings that mean the call broke rather than finished.
_FAILURE_MARKERS = ("error", "failed", "no-answer", "busy", "rejected")


def parse_ts(value) -> datetime | None:
    """Vapi sends ISO-8601 with a trailing 'Z'; epoch millis show up too."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def status_from_reason(ended_reason: str | None) -> str:
    if not ended_reason:
        return "completed"
    lowered = ended_reason.lower()
    return "failed" if any(m in lowered for m in _FAILURE_MARKERS) else "completed"


def get_or_create(
    db: Session, *, agent: Agent, call_id: str | None, **defaults
) -> Conversation:
    """Find this call's row or start one. Caller commits."""
    conv = None
    if call_id:
        conv = (
            db.query(Conversation)
            .filter(
                Conversation.tenant_id == agent.tenant_id,
                Conversation.vapi_call_id == call_id,
            )
            .first()
        )
    if conv is None:
        conv = Conversation(
            tenant_id=agent.tenant_id,
            agent_id=agent.id,
            vapi_call_id=call_id,
            status="active",
            **defaults,
        )
        db.add(conv)
        db.flush()
    return conv


def _caller_number(call: dict) -> str | None:
    """Vapi puts the caller under `customer.number` for a real phone call; web
    test calls have no customer at all."""
    number = (call.get("customer") or {}).get("number")
    return str(number)[:20] if number else None


def _direction(call: dict) -> str:
    """Vapi's `type` is e.g. inboundPhoneCall / outboundPhoneCall / webCall."""
    kind = str(call.get("type") or "").lower()
    if "outbound" in kind:
        return "outbound"
    if "web" in kind:
        return "web"
    return "inbound"


def record_status_update(db: Session, agent: Agent, payload: dict) -> Conversation | None:
    """Handle a `status-update` message — the call starting or ringing."""
    call = payload.get("call") or {}
    call_id = call.get("id")
    if not call_id:
        return None

    conv = get_or_create(db, agent=agent, call_id=call_id, direction=_direction(call))
    if conv.started_at is None:
        conv.started_at = parse_ts(call.get("startedAt")) or datetime.now(timezone.utc)
    if conv.caller_number is None:
        conv.caller_number = _caller_number(call)
    # Never walk a finished call back to `active`: reports can arrive out of order.
    if conv.status == "active" and str(payload.get("status") or "") == "ended":
        conv.status = status_from_reason(payload.get("endedReason"))
    db.commit()
    return conv


def record_end_of_call(db: Session, agent: Agent, payload: dict) -> Conversation | None:
    """Handle an `end-of-call-report` — the full record, including transcript."""
    call = payload.get("call") or {}
    call_id = call.get("id")
    if not call_id:
        return None

    conv = get_or_create(db, agent=agent, call_id=call_id, direction=_direction(call))

    started = parse_ts(payload.get("startedAt")) or parse_ts(call.get("startedAt"))
    ended = parse_ts(payload.get("endedAt"))
    conv.started_at = conv.started_at or started
    # Only fall back to "now" for a call we hadn't already closed — a repeated
    # report carrying no endedAt must not move the end time forward.
    conv.ended_at = ended or conv.ended_at or datetime.now(timezone.utc)

    ended_reason = payload.get("endedReason")
    conv.ended_reason = (str(ended_reason)[:64] if ended_reason else None) or conv.ended_reason
    conv.status = status_from_reason(ended_reason)

    if conv.caller_number is None:
        conv.caller_number = _caller_number(call)

    # Prefer Vapi's own duration. The timestamp fallback only fills a gap — it
    # never overwrites a duration we already have, since a resent report with
    # no timing would otherwise compute "start until now".
    duration = payload.get("durationSeconds")
    if duration is None and conv.duration_seconds is None and conv.started_at and conv.ended_at:
        duration = (conv.ended_at - conv.started_at).total_seconds()
    if duration is not None:
        conv.duration_seconds = max(0, int(float(duration)))

    cost = payload.get("cost")
    if cost is not None:
        try:
            conv.cost_usd = round(float(cost), 4)
        except (TypeError, ValueError):
            pass

    for field, key in (
        ("recording_url", "recordingUrl"),
        ("summary", "summary"),
        ("transcript", "transcript"),
    ):
        value = payload.get(key) or (payload.get("artifact") or {}).get(key)
        if value:
            setattr(conv, field, str(value))

    _sync_messages(db, conv, payload)
    db.commit()
    return conv


def _sync_messages(db: Session, conv: Conversation, payload: dict) -> None:
    """Replace the turn-by-turn messages with the report's version.

    The report is authoritative and arrives once, so rewriting is simpler than
    diffing — and it repairs anything a dropped custom-LLM trace missed. Only
    runs when the report actually carries messages.
    """
    raw = payload.get("messages") or (payload.get("artifact") or {}).get("messages") or []
    turns = [
        m
        for m in raw
        if isinstance(m, dict)
        and m.get("role") in ("user", "assistant", "system", "tool", "bot")
        and str(m.get("message") or m.get("content") or "").strip()
    ]
    if not turns:
        return

    db.query(Message).filter(Message.conversation_id == conv.id).delete(
        synchronize_session=False
    )
    for seq, turn in enumerate(turns):
        # Vapi says "bot" where our schema (and OpenAI) says "assistant".
        role = "assistant" if turn["role"] == "bot" else turn["role"]
        db.add(
            Message(
                tenant_id=conv.tenant_id,
                conversation_id=conv.id,
                role=role,
                content=str(turn.get("message") or turn.get("content") or "").strip(),
                seq=seq,
            )
        )
