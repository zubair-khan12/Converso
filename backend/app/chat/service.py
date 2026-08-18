"""One turn of a chat conversation.

A chat agent is not a second product: it's the *same* `Agent` row, the same
LangGraph brain, the same knowledge base and the same Cal.com tools as a voice
agent — only the transport differs. Voice turns arrive from Vapi as an
OpenAI-shaped request and leave as SSE; chat turns arrive from our own frontend
as JSON and leave as JSON. Everything between those two edges is shared, so a
fix to retrieval or booking lands on both channels at once.

The other consequence of that symmetry: a chat session is a `Conversation` with
`channel="chat"`, so transcripts, the tool trace and the dashboard stats all
work with no new plumbing.
"""
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, AnyMessage, HumanMessage
from sqlalchemy.orm import Session

from ..agents.models import Agent
from ..conversations import service as conversations
from ..conversations.models import Conversation, Message
from ..integrations.service import get_calcom_config
from ..vapi.rag_agent import run_brain

# How many past turns are replayed into the model. Long chats are cheap to
# store and expensive to send: every turn would otherwise re-embed the whole
# history into the prompt on the platform OpenAI key.
HISTORY_TURNS = 20


def start_session(db: Session, agent: Agent) -> Conversation:
    """Open a chat session. Committing is the caller's job."""
    conv = Conversation(
        tenant_id=agent.tenant_id,
        agent_id=agent.id,
        channel="chat",
        # A chat has no phone leg; "web" is the closest true statement about
        # where it came from.
        direction="web",
        status="active",
        started_at=datetime.now(timezone.utc),
    )
    db.add(conv)
    db.flush()
    return conv


def history_for(db: Session, conv: Conversation) -> list[AnyMessage]:
    """The stored turns, oldest first, as LangChain messages."""
    rows = (
        db.query(Message)
        .filter(Message.conversation_id == conv.id)
        .order_by(Message.seq.desc())
        .limit(HISTORY_TURNS)
        .all()
    )
    history: list[AnyMessage] = []
    for row in reversed(rows):
        content = (row.content or "").strip()
        if not content:
            continue
        if row.role == "user":
            history.append(HumanMessage(content=content))
        elif row.role == "assistant":
            history.append(AIMessage(content=content))
    return history


def _next_seq(db: Session, conv: Conversation) -> int:
    last = (
        db.query(Message.seq)
        .filter(Message.conversation_id == conv.id)
        .order_by(Message.seq.desc())
        .first()
    )
    return (last[0] + 1) if last else 0


def run_turn(db: Session, agent: Agent, conv: Conversation, message: str) -> dict:
    """Answer one user message. Returns the brain's full result.

    The user's message is stored *before* the model runs, so a turn that fails
    still leaves a record of what was asked rather than silently vanishing.
    """
    cfg = agent.config or {}
    # The graph's agent node prompts on `messages` alone — `query` only drives
    # retrieval — so the current turn has to be in the list or the model answers
    # without ever seeing the question. The voice path gets this for free
    # because Vapi's payload already ends with the caller's turn.
    history = [*history_for(db, conv), HumanMessage(content=message)]

    seq = _next_seq(db, conv)
    db.add(
        Message(
            tenant_id=agent.tenant_id,
            conversation_id=conv.id,
            role="user",
            content=message,
            seq=seq,
        )
    )
    db.commit()

    result = run_brain(
        db=db,
        agent_id=str(agent.id),
        base_prompt=agent.base_prompt or "",
        temperature=float(cfg.get("temperature", 0.7)),
        query=message,
        history=history,
        rag_enabled=bool(cfg.get("rag_enabled")),
        # None unless Cal.com is connected *and* linked to this agent — the
        # same per-agent rule voice agents follow.
        calcom=get_calcom_config(db, str(agent.tenant_id), str(agent.id)),
    )

    answer = (result.get("answer") or "").strip()
    db.add(
        Message(
            tenant_id=agent.tenant_id,
            conversation_id=conv.id,
            role="assistant",
            content=answer,
            seq=seq + 1,
        )
    )
    conversations.record_brain_turn(
        db, agent=agent, conversation=conv, query=message, result=result
    )
    db.commit()
    return result


def close_session(db: Session, conv: Conversation) -> Conversation:
    """Mark a chat finished, filling the duration the same way a call's is, so
    both channels report into the dashboard's stats identically."""
    if conv.status == "active":
        conv.status = "completed"
    conv.ended_at = conv.ended_at or datetime.now(timezone.utc)
    if conv.duration_seconds is None and conv.started_at:
        conv.duration_seconds = max(
            0, int((conv.ended_at - conv.started_at).total_seconds())
        )
    db.commit()
    return conv
