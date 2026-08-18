"""Guards for the public widget.

Everything here exists because this is the one surface a stranger can reach.
A widget turn runs retrieval and generation on the **platform** OpenAI key, so
an open endpoint is an open invoice. Three independent limits stand between the
internet and that key, and each fails closed:

  1. the token must exist, belong to an enabled widget, and match an agent;
  2. the request's Origin must be one the tenant explicitly allowed;
  3. per-IP and per-tenant limits cap what a single visitor, or a single
     compromised snippet, can spend in a day.

None of these replaces the others: an allowlisted origin is trivially forged by
a script that isn't a browser, so the rate limits are the real backstop.
"""
import re
from datetime import datetime, time, timedelta, timezone
from secrets import token_urlsafe
from urllib.parse import urlparse

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..agents.models import Agent
from ..conversations.models import Conversation, Message

# Per-IP burst limit: enough for a real conversation, far below what a script
# needs to be expensive.
RATE_LIMIT_MESSAGES = 20
RATE_LIMIT_WINDOW = timedelta(minutes=1)

# Per-tenant daily ceiling across every widget they run. The real protection
# against a leaked snippet: a scraped token can burn one day's quota, not the
# month's bill.
DAILY_MESSAGE_CAP = 500

TOKEN_BYTES = 24  # ~32 chars of urlsafe base64

# host[:port] — letters, digits, dots and hyphens only. Anything else ("acme
# .com/../", "javascript:alert(1)") is a typo or an attempt, and either way must
# not be written into an allowlist as though it were a site.
_HOST_RE = re.compile(r"^[a-z0-9.-]+(:\d{1,5})?$")


def new_token() -> str:
    return token_urlsafe(TOKEN_BYTES)


def normalize_origin(raw: str) -> str | None:
    """Reduce whatever the tenant typed to a bare scheme://host[:port].

    People paste "acme.com", "https://acme.com/", "https://acme.com/contact" —
    all meaning the same site. Browsers send only the origin, so a stored path
    would never match anything and the widget would silently refuse to load.
    """
    value = (raw or "").strip().rstrip("/")
    if not value:
        return None
    if "://" not in value:
        value = f"https://{value}"
    parsed = urlparse(value)
    host = parsed.netloc.lower()
    if parsed.scheme not in ("http", "https") or not _HOST_RE.match(host):
        return None
    return f"{parsed.scheme}://{host}"


def origin_allowed(agent: Agent, origin: str | None) -> bool:
    """Whether this Origin header may embed this agent.

    A missing Origin is refused rather than waved through: browsers always send
    one on a cross-origin request, so "no Origin" means something that isn't a
    browser page — exactly the case the allowlist exists for.
    """
    allowed = agent.allowed_origins or []
    if not allowed or not origin:
        return False
    normalized = normalize_origin(origin)
    return normalized is not None and normalized in allowed


def get_widget_agent(db: Session, token: str) -> Agent | None:
    """The agent behind a public token, if its widget is live."""
    if not token:
        return None
    agent = db.query(Agent).filter(Agent.public_token == token).first()
    if agent is None or not agent.widget_enabled or not agent.is_active:
        return None
    return agent


# --- Rate limiting ---------------------------------------------------------
# In-process and therefore per-worker: two workers allow twice the burst, and a
# restart forgets. That is a deliberate trade for now — the daily cap below is
# the limit that actually bounds spend, and it is counted in the database, so
# it survives both. Moving the burst limit to Redis is the upgrade path.
_hits: dict[str, list[datetime]] = {}


def rate_limited(key: str, *, now: datetime | None = None) -> bool:
    now = now or datetime.now(timezone.utc)
    cutoff = now - RATE_LIMIT_WINDOW
    recent = [t for t in _hits.get(key, []) if t > cutoff]
    if len(recent) >= RATE_LIMIT_MESSAGES:
        _hits[key] = recent
        return True
    recent.append(now)
    _hits[key] = recent
    # Opportunistic sweep so an unbounded set of visitor IPs can't grow the
    # dict forever on a busy day.
    if len(_hits) > 5000:
        for k in [k for k, v in _hits.items() if not any(t > cutoff for t in v)]:
            _hits.pop(k, None)
    return False


def daily_usage(db: Session, tenant_id: str) -> int:
    """Visitor messages this tenant's widgets have taken today (UTC).

    Counted from `messages`, not from a counter, so it is accurate after a
    restart and can be shown to the tenant as a real number.
    """
    since = datetime.combine(
        datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc
    )
    return (
        db.query(func.count(Message.id))
        .join(Conversation, Conversation.id == Message.conversation_id)
        .filter(
            Message.tenant_id == tenant_id,
            Message.role == "user",
            Conversation.channel == "chat",
            Message.created_at >= since,
        )
        .scalar()
        or 0
    )


def over_daily_cap(db: Session, tenant_id: str) -> bool:
    return daily_usage(db, tenant_id) >= DAILY_MESSAGE_CAP
