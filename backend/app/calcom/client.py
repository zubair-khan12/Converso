"""Thin wrapper around Cal.com's API v2, used for agent-driven scheduling.

Same shape as `app/vapi/client.py`: every call takes the *tenant's own* Cal.com
API key (created at cal.com → Settings → Developer → API keys), so bookings land
in that tenant's calendar and we never hold a platform-wide key.

Cal.com versions each endpoint group separately via a `cal-api-version` header —
sending the wrong one is a 400, so the constants below are per-group, not global:

    /v2/me            (no version header)
    /v2/event-types   2024-06-14
    /v2/slots         2024-09-04
    /v2/bookings      2024-08-13
"""
from datetime import date

import httpx

CALCOM_API_BASE = "https://api.cal.com/v2"

EVENT_TYPES_VERSION = "2024-06-14"
SLOTS_VERSION = "2024-09-04"
BOOKINGS_VERSION = "2024-08-13"

TIMEOUT = 20.0


class CalComError(Exception):
    """A Cal.com API call failed. `status_code` is their HTTP status if any."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _headers(api_key: str, version: str | None = None) -> dict:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    if version:
        headers["cal-api-version"] = version
    return headers


def _raise_for_status(resp: httpx.Response, action: str) -> None:
    if resp.status_code < 400:
        return
    detail = ""
    try:
        body = resp.json()
        err = body.get("error") or {}
        if isinstance(err, dict):
            detail = err.get("message") or ""
        detail = detail or body.get("message") or ""
        if isinstance(detail, list):
            detail = "; ".join(str(d) for d in detail)
    except Exception:
        detail = resp.text[:200]
    # Cal.com's own wording is far more useful than anything we'd invent — a 401
    # can mean a self-hosted key, a plan that doesn't cover the endpoint, or a
    # genuinely wrong key, and only their message distinguishes them. Never
    # flatten it away.
    message = f"Cal.com could not {action} (HTTP {resp.status_code})"
    if detail:
        message += f": {detail}"
    print(f"[CALCOM] {resp.request.method} {resp.request.url} -> {resp.status_code} {detail or resp.text[:200]!r}")
    raise CalComError(message, status_code=resp.status_code)


def _request(method: str, path: str, api_key: str, *, version: str | None, action: str, **kwargs) -> dict:
    try:
        resp = httpx.request(
            method,
            f"{CALCOM_API_BASE}{path}",
            headers=_headers(api_key, version),
            timeout=TIMEOUT,
            **kwargs,
        )
    except httpx.HTTPError as exc:
        raise CalComError(f"Could not reach Cal.com: {exc}") from exc
    _raise_for_status(resp, action)
    try:
        return resp.json()
    except ValueError as exc:
        raise CalComError("Cal.com returned an unreadable response.") from exc


def get_me(api_key: str) -> dict:
    """The API key's owner: `{id, username, email, name, timeZone, ...}`.

    Doubles as key validation — a bad key 401s here before anything is stored.
    """
    body = _request("GET", "/me", api_key, version=None, action="verify the API key")
    return body.get("data") or {}


def list_event_types(api_key: str, username: str | None = None) -> list[dict]:
    """The owner's bookable event types (`id`, `title`, `slug`,
    `lengthInMinutes`). Scoped by `username` so we get this account's own
    event types rather than a public lookup."""
    params = {"username": username} if username else None
    body = _request(
        "GET",
        "/event-types",
        api_key,
        version=EVENT_TYPES_VERSION,
        action="list your event types",
        params=params,
    )
    data = body.get("data") or []
    return [
        {
            "id": e.get("id"),
            "title": e.get("title") or e.get("slug") or "Untitled",
            "slug": e.get("slug"),
            "length_minutes": e.get("lengthInMinutes"),
        }
        for e in data
        if e.get("id") is not None
    ]


def get_slots(
    api_key: str,
    *,
    event_type_id: int,
    start: date,
    end: date,
    time_zone: str,
) -> dict[str, list[str]]:
    """Free slots for an event type between two dates, as
    `{"2026-08-03": ["2026-08-03T09:00:00.000+05:00", ...]}`.

    Cal.com returns each slot as `{"start": ...}`; older responses used bare
    strings, so both shapes are flattened to the ISO start string.
    """
    body = _request(
        "GET",
        "/slots",
        api_key,
        version=SLOTS_VERSION,
        action="look up available slots",
        params={
            "eventTypeId": event_type_id,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "timeZone": time_zone,
        },
    )
    out: dict[str, list[str]] = {}
    for day, slots in (body.get("data") or {}).items():
        starts = []
        for s in slots or []:
            value = s.get("start") if isinstance(s, dict) else s
            if value:
                starts.append(value)
        if starts:
            out[day] = starts
    return out


def create_booking(
    api_key: str,
    *,
    event_type_id: int,
    start: str,
    name: str,
    email: str,
    time_zone: str,
) -> dict:
    """Book `start` (an ISO 8601 datetime, normally one Cal.com just offered as
    a free slot) for this attendee. Cal.com re-checks availability, so a slot
    taken since we listed it fails here rather than double-booking."""
    body = _request(
        "POST",
        "/bookings",
        api_key,
        version=BOOKINGS_VERSION,
        action="book the meeting",
        json={
            "eventTypeId": event_type_id,
            "start": start,
            "attendee": {
                "name": name,
                "email": email,
                "timeZone": time_zone,
                "language": "en",
            },
        },
    )
    return body.get("data") or {}
