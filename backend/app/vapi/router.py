"""Vapi-facing endpoints.

Two very different audiences live here:
  - `GET /api/vapi/voices` — called by our own frontend (JWT-gated).
  - `POST /api/vapi/custom-llm/{agent_id}/chat/completions` and
    `POST /api/vapi/webhook/{agent_id}` — called by *Vapi's* servers (no JWT;
    it's Vapi, not a browser). The first is the custom-LLM endpoint: a trained
    agent's Vapi assistant points its `model.url` here, so every conversational
    turn runs through our LangGraph RAG brain. The second is the server webhook
    every agent gets, trained or not — it's what turns a call into a call log.
    Both identify the agent by the unguessable UUID in the path (a capability
    token) — never trusted from the request body.
"""
import json
import time
import traceback

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..agents.models import Agent
from ..config import settings
from ..conversations import service as conversations
from ..database import get_db
from ..deps import get_current_claims
from ..integrations.service import get_calcom_config
from ..tenants.models import Tenant
from .client import VOICE_PROVIDER, VOICES
from .rag_agent import FALLBACK_ANSWER, run_brain

router = APIRouter(prefix="/api/vapi", tags=["vapi"])

# Spoken to a caller when the tenant's account is disabled. Says something
# true and ends the interaction politely — the alternative on a live phone
# line is silence, which reads as a broken number.
DISABLED_ACCOUNT_ANSWER = (
    "I'm sorry, this line isn't taking calls at the moment. "
    "Please try again later. Goodbye."
)


@router.get("/voices")
def list_voices(claims: dict = Depends(get_current_claims)):
    """The catalog of built-in voices an agent can use. Static — Vapi has no
    list-voices API — but auth-gated so it lives with the rest of the app."""
    return {"provider": VOICE_PROVIDER, "voices": VOICES}


# --- Custom-LLM brain (called by Vapi, not the browser) ---


def _messages_from_openai(raw: list[dict]) -> tuple[list[AnyMessage], str]:
    """Convert Vapi's OpenAI-format messages into LangChain history + the latest
    user query. Incoming system messages are dropped — the graph builds its own
    system prompt (base prompt + retrieved knowledge)."""
    history: list[AnyMessage] = []
    query = ""
    for m in raw:
        role = m.get("role")
        content = m.get("content")
        if isinstance(content, list):  # OpenAI "content parts" form
            content = " ".join(
                p.get("text", "") for p in content if isinstance(p, dict)
            )
        content = (content or "").strip()
        if role == "user":
            history.append(HumanMessage(content=content))
            query = content
        elif role == "assistant" and content:
            history.append(AIMessage(content=content))
    return history, query


def _persist_trace(
    db: Session, agent: Agent, call_id: str | None, query: str, result: dict
) -> None:
    """Save what the brain did this turn so past turns are inspectable (the
    'saved' half of console+saved). Shares the call-log upsert so a brain turn
    and the end-of-call report land on the same Conversation row, and shares the
    trace writer with the chat channel."""
    conv = conversations.get_or_create(db, agent=agent, call_id=call_id)
    conversations.record_brain_turn(
        db, agent=agent, conversation=conv, query=query, result=result
    )
    db.commit()


def _run_turn(db: Session, agent_id: str, body: dict) -> str:
    """Resolve the agent, run one turn through the brain, persist the trace.
    Returns the assistant's answer text. Runs entirely in a worker thread
    (sync DB + LLM)."""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Unknown agent.")

    # A disabled tenant must not run turns on the *platform* OpenAI key. The
    # JWT gate can't cover this endpoint — Vapi calls it, not a browser — so
    # the check is repeated here against the agent's own tenant. Disabling
    # detaches their numbers too, so this should only ever fire in the window
    # between the two, or if a number was re-attached out of band.
    tenant = db.get(Tenant, agent.tenant_id)
    if tenant is not None and not tenant.is_enabled:
        print(f"[brain] refusing turn: tenant {tenant.slug} is {tenant.status}")
        return DISABLED_ACCOUNT_ANSWER

    history, query = _messages_from_openai(body.get("messages", []))
    call_id = (body.get("call") or {}).get("id")
    cfg = agent.config or {}
    temperature = float(cfg.get("temperature", 0.7))

    result = run_brain(
        db=db,
        agent_id=str(agent.id),
        base_prompt=agent.base_prompt or "",
        temperature=temperature,
        query=query,
        history=history,
        rag_enabled=bool(cfg.get("rag_enabled")),
        # None unless Cal.com is connected *and* this is the agent it was
        # linked to — the tenant's other agents get no booking tools.
        calcom=get_calcom_config(db, str(agent.tenant_id), str(agent.id)),
    )

    try:
        _persist_trace(db, agent, call_id, query, result)
    except Exception as exc:  # tracing must never break the call
        db.rollback()
        print(f"[RAG] warning: could not persist trace: {exc}")

    return result.get("answer", "") or ""


def _sse_chunks(answer: str, model: str):
    """Yield the answer as OpenAI-compatible chat.completion.chunk SSE events.

    The answer is already computed; we split it into small pieces so Vapi's TTS
    can start speaking before the whole string is flushed."""
    created = int(time.time())
    base = {
        "id": f"chatcmpl-{created}",
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
    }

    def event(delta: dict, finish=None) -> str:
        payload = {**base, "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
        return f"data: {json.dumps(payload)}\n\n"

    yield event({"role": "assistant", "content": ""})
    # Emit a token at a time (keeping trailing spaces) for smooth speech.
    for piece in _tokenize(answer):
        yield event({"content": piece})
    yield event({}, finish="stop")
    yield "data: [DONE]\n\n"


def _tokenize(text: str) -> list[str]:
    """Split into word-ish pieces, preserving spacing so re-concatenation is
    lossless."""
    if not text:
        return []
    out, cur = [], ""
    for ch in text:
        cur += ch
        if ch == " ":
            out.append(cur)
            cur = ""
    if cur:
        out.append(cur)
    return out


# --- Server webhook (called by Vapi, not the browser) ---


def _handle_event(db: Session, agent_id: str, message: dict) -> str:
    """Route one Vapi server message to its handler. Returns what we did, for
    the console trace."""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Unknown agent.")

    kind = message.get("type")
    if kind == "end-of-call-report":
        conv = conversations.record_end_of_call(db, agent, message)
        return f"call log {conv.id} finalized" if conv else "ignored (no call id)"
    if kind == "status-update":
        conv = conversations.record_status_update(db, agent, message)
        return f"call log {conv.id} updated" if conv else "ignored (no call id)"
    # Vapi sends plenty of other message types (speech-update, transcript, …).
    # Acknowledge them so it doesn't retry, but don't store them.
    return f"ignored ({kind})"


@router.post("/webhook/{agent_id}")
async def vapi_webhook(agent_id: str, request: Request, db: Session = Depends(get_db)):
    """Vapi's server messages for one agent — where call logs come from.

    Like the custom-LLM endpoint, the agent UUID in the path is the capability
    token; Vapi sends no JWT. Always answers 200 unless the agent is unknown:
    a 5xx makes Vapi retry, and a webhook failure must never look like a call
    failure.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    message = body.get("message") if isinstance(body.get("message"), dict) else body
    try:
        outcome = await run_in_threadpool(_handle_event, db, agent_id, message)
        print(f"[vapi-webhook] {message.get('type')} → {outcome}")
    except HTTPException:
        raise
    except Exception as exc:  # never fail a webhook over a persistence bug
        db.rollback()
        print(f"[vapi-webhook] warning: could not persist {message.get('type')}: {exc}")

    return {"received": True}


@router.post("/custom-llm/{agent_id}/chat/completions")
async def custom_llm(
    agent_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """OpenAI-compatible chat-completions endpoint Vapi calls every turn for a
    trained agent. Returns a streaming SSE response."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    model = body.get("model") or settings.RAG_LLM_MODEL
    # Heavy work (DB + embeddings + LLM) off the event loop.
    #
    # Whatever goes wrong in there, this endpoint must still answer with valid
    # SSE. A 500 gives Vapi nothing to speak, so the caller just hears silence
    # on a live phone call — far worse than an apology. The traceback is
    # printed for us; the caller gets a sentence.
    try:
        answer = await run_in_threadpool(_run_turn, db, agent_id, body)
    except Exception:
        traceback.print_exc()
        answer = FALLBACK_ANSWER

    return StreamingResponse(
        _sse_chunks(answer, model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
