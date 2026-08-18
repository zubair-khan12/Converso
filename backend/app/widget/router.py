"""Public widget endpoints — the only routes with no JWT.

Called by a `<script>` or `<iframe>` on the tenant's own website, so the caller
is an anonymous visitor, not a signed-in user. The agent is identified by its
public token; every response carries CORS headers computed per request, because
the set of allowed origins is per agent and can't be a static app-wide list.

Kept apart from `app/chat/` on purpose: that router can assume a verified
tenant, this one can assume nothing.
"""
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..agents.models import Agent
from ..chat import service as chat_service
from ..conversations.models import Conversation
from ..database import get_db
from ..integrations.service import get_vapi_public_key
from ..tenants.models import Tenant
from . import service

router = APIRouter(prefix="/api/widget", tags=["widget"])

MAX_MESSAGE_CHARS = 2000


class WidgetMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    session_id: str | None = None


def request_origin(request: Request) -> str | None:
    """The origin of the *page the widget is embedded in*.

    Not simply the `Origin` header: the widget renders inside an iframe served
    from our own frontend, so the browser reports our origin, never the site
    that embedded it. The embedding origin is therefore forwarded explicitly by
    our frontend, which learns it from the iframe request's `Referer` — a header
    a page's own JavaScript cannot forge.

    That still isn't proof: a non-browser client can send whatever it likes. The
    allowlist stops a copied snippet from working on another *site*; the rate
    limit and daily cap in `service.py` are what stop a script, and they apply
    no matter what this returns.
    """
    return request.headers.get("x-widget-origin") or request.headers.get("origin")


def _cors(origin: str | None) -> dict:
    """Headers echoing one allowed origin. Only ever called after the origin has
    been checked, so it can't widen access on its own."""
    return {
        "Access-Control-Allow-Origin": origin or "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Origin",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
    }


def _refuse(status: int, message: str, origin: str | None = None) -> JSONResponse:
    """A refusal the widget can render. CORS headers are attached even here —
    without them the browser hides the response and the visitor sees a silent
    dead box instead of the reason."""
    return JSONResponse({"error": message}, status_code=status, headers=_cors(origin))


def _resolve(db: Session, token: str, origin: str | None) -> tuple[Agent | None, JSONResponse | None]:
    """The agent for this token, or the refusal to return instead."""
    agent = service.get_widget_agent(db, token)
    if agent is None:
        # Same answer for "no such token" and "widget switched off", so the
        # endpoint can't be used to enumerate which tokens exist.
        return None, _refuse(404, "This widget isn't available.")
    if not service.origin_allowed(agent, origin):
        # Name the origin we actually saw. It's the caller's own address, so
        # echoing it reveals nothing — and without it "not allowed" sends the
        # site owner hunting through a correct-looking allowlist.
        if not origin or origin == "null":
            return None, _refuse(
                403,
                "This page has no web address to check — sandboxed previews "
                "(like the W3Schools editor) and files opened from disk can't "
                "run the widget. Try it on your real site.",
            )
        return None, _refuse(
            403,
            f"This widget isn't allowed on {origin}. Add that exact address to "
            "the allowed websites for this agent.",
        )

    tenant = db.get(Tenant, agent.tenant_id)
    if tenant is not None and not tenant.is_enabled:
        return None, _refuse(403, "This widget isn't available.", origin)
    return agent, None


@router.options("/{token}/messages")
@router.options("/{token}")
def preflight(token: str, request: Request, db: Session = Depends(get_db)):
    """Answer the browser's preflight without running anything. Refusals here
    are still 200 with no allow-origin header — that is how a browser learns
    "not allowed" rather than "broken"."""
    origin = request_origin(request)
    agent = service.get_widget_agent(db, token)
    if agent is None or not service.origin_allowed(agent, origin):
        return Response(status_code=200)
    return Response(status_code=200, headers=_cors(origin))


@router.get("/{token}")
def widget_config(token: str, request: Request, db: Session = Depends(get_db)):
    """What the widget needs to render itself: who the agent is, and for a voice
    agent the credentials for a browser call.

    The Vapi *public* key is publishable by design (it is what their web SDK
    expects in a browser); the private key never leaves the server.
    """
    origin = request_origin(request)
    agent, refusal = _resolve(db, token, origin)
    if refusal is not None:
        return refusal

    cfg = agent.config or {}
    payload = {
        "agent_id": str(agent.id),
        "name": agent.name,
        "kind": agent.kind,
        "first_message": cfg.get("first_message", ""),
        "knowledge_trained": bool(cfg.get("rag_enabled")),
    }
    if agent.kind == "voice":
        payload["assistant_id"] = agent.vapi_assistant_id
        payload["public_key"] = get_vapi_public_key(db, str(agent.tenant_id))
    return JSONResponse(payload, headers=_cors(origin))


@router.post("/{token}/messages")
async def widget_message(
    token: str,
    body: WidgetMessageRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """One turn of a public chat. Same brain, same knowledge base, same booking
    tools as the dashboard — only the caller is anonymous."""
    origin = request_origin(request)
    agent, refusal = _resolve(db, token, origin)
    if refusal is not None:
        return refusal
    if agent.kind != "chat":
        return _refuse(400, "This agent answers by voice, not by chat.", origin)

    # Burst limit per visitor per agent, then the tenant's daily ceiling.
    visitor = request.client.host if request.client else "unknown"
    if service.rate_limited(f"{token}:{visitor}"):
        return _refuse(429, "You're sending messages too quickly. Try again shortly.", origin)
    if service.over_daily_cap(db, str(agent.tenant_id)):
        return _refuse(429, "This assistant has reached its limit for today.", origin)

    if body.session_id:
        conv = (
            db.query(Conversation)
            .filter(
                Conversation.id == body.session_id,
                Conversation.tenant_id == agent.tenant_id,
                Conversation.agent_id == agent.id,
                Conversation.channel == "chat",
            )
            .first()
        )
        # An unknown or foreign session id starts a fresh one rather than
        # erroring: a visitor with a stale tab should get a working chat, and
        # guessing ids must never reach someone else's conversation.
        if conv is None:
            conv = chat_service.start_session(db, agent)
            db.commit()
    else:
        conv = chat_service.start_session(db, agent)
        db.commit()

    message = body.message.strip()
    if not message:
        return _refuse(400, "Message cannot be empty.", origin)

    result = await run_in_threadpool(chat_service.run_turn, db, agent, conv, message)
    return JSONResponse(
        {"session_id": str(conv.id), "answer": result.get("answer", "")},
        headers=_cors(origin),
    )
