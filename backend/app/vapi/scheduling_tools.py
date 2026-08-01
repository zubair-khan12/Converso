"""Cal.com scheduling tools — the agent's second tool after the knowledge base.

These are built *per call*, not at import, because every argument that matters
(which API key, which event type, which timezone) belongs to the tenant whose
agent is on the phone. `build_scheduling_tools` closes over that tenant's config
and hands back LangChain tools the LangGraph brain can bind to the model.

Both tools return plain prose rather than JSON: the model's next move is to say
something out loud, and a sentence is far less likely to be read back verbatim
as machine output than a dict is.

Every invocation is appended to a shared `trace` list (console-printed as it
happens, persisted by `app/vapi/router.py`) — the same learning-visibility
treatment the RAG retrieval gets.
"""
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from langchain_core.tools import StructuredTool

from ..calcom.client import CalComError, create_booking, get_slots

# How far ahead to look when the caller has no preference, and how many options
# to put in front of the model — a phone caller can't hold a long list in their
# head, and a huge list just crowds the context.
DEFAULT_LOOKAHEAD_DAYS = 7
MAX_SLOTS_RETURNED = 6
# A 15-minute event type on an open calendar yields ~30 slots a day, so simply
# taking the first N returns 09:00, 09:15, 09:30… — all effectively the same
# time. Useless to offer aloud, and it invites the model to keep re-checking
# for something better. Spread the picks instead.
MAX_SLOTS_PER_DAY = 2

# A hard ceiling on tool calls within a single turn. A small model will happily
# re-check the calendar forever when a day comes back empty, and the caller is
# sitting in silence while it does. Past this we refuse to run and tell the
# model to speak — a deterministic stop, rather than relying on the graph's
# recursion limit (which surfaces as an error, not an answer).
MAX_TOOL_CALLS_PER_TURN = 4


def _tz(config: dict) -> ZoneInfo:
    try:
        return ZoneInfo(config.get("time_zone") or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def today_in(config: dict) -> date:
    return datetime.now(_tz(config)).date()


def _speakable(iso_start: str, tz: ZoneInfo) -> str:
    """'2026-08-04T14:00:00.000+05:00' → 'Tuesday 4 August at 2:00 PM'."""
    try:
        moment = datetime.fromisoformat(iso_start.replace("Z", "+00:00")).astimezone(tz)
    except ValueError:
        return iso_start
    hour = moment.strftime("%I").lstrip("0") or "12"
    return f"{moment.strftime('%A')} {moment.day} {moment.strftime('%B')} at {hour}:{moment.strftime('%M %p')}"


def _spread(values: list[str], count: int) -> list[str]:
    """Up to `count` items spaced evenly across `values`, keeping order.

    Picking evenly rather than taking a prefix is what turns "9:00, 9:15, 9:30"
    into "9:00, 1:00, 4:30" — genuinely different times a caller can choose
    between.
    """
    if count <= 0 or not values:
        return []
    if len(values) <= count:
        return list(values)
    step = len(values) / count
    return [values[int(i * step)] for i in range(count)]


def _offerable(by_day: dict[str, list[str]], *, single_day: bool) -> list[str]:
    """Turn Cal.com's full availability into a short, varied set of options.

    For one specific day, spread across that day (morning through afternoon).
    Across several days, take a couple per day so the caller hears real
    alternatives — different days, not four consecutive quarter-hours.
    """
    if single_day:
        day_slots = next(iter(by_day.values()), [])
        return _spread(day_slots, MAX_SLOTS_RETURNED)

    picked: list[str] = []
    for day in sorted(by_day):
        if len(picked) >= MAX_SLOTS_RETURNED:
            break
        room = min(MAX_SLOTS_PER_DAY, MAX_SLOTS_RETURNED - len(picked))
        picked.extend(_spread(by_day[day], room))
    return picked


def _print_trace(label: str, detail: str) -> None:
    print("\n" + "-" * 68)
    print(f"[CALCOM] {label}")
    for line in detail.splitlines():
        print(f"   {line}")
    print("-" * 68 + "\n")


def build_scheduling_tools(config: dict, trace: list[dict]) -> list[StructuredTool]:
    """Tools bound to one tenant's Cal.com account.

    `config` is `integrations.service.get_calcom_config`'s output; `trace` is
    appended to in place so the caller can persist what the tools did.
    """
    api_key = config["api_key"]
    event_type_id = config["event_type_id"]
    tz_name = config.get("time_zone") or "UTC"
    tz = _tz(config)

    def _budget_exhausted() -> str | None:
        """The message to return instead of running, once this turn has used up
        its tool budget. Ends the loop by giving the model nothing new to act
        on and an explicit instruction to talk."""
        if len(trace) < MAX_TOOL_CALLS_PER_TURN:
            return None
        _print_trace(
            "tool budget exhausted",
            f"{len(trace)} calls this turn — refusing further calls",
        )
        return (
            "Stop checking the calendar and speak to the caller now. Tell them what "
            "you already found, or that you're having trouble finding a time and will "
            "follow up. Do not call any more tools this turn."
        )

    def _record(tool_name: str, args: dict, output: str, ms: int, ok: bool) -> None:
        trace.append(
            {
                "tool_name": tool_name,
                "input": args,
                "output": output,
                "latency_ms": ms,
                "status": "success" if ok else "error",
            }
        )
        _print_trace(f"{tool_name} ({ms} ms, {'ok' if ok else 'error'})", f"args: {args}\n{output}")

    def find_available_slots(day: str = "") -> str:
        """Look up free meeting times. `day` is an exact calendar date as
        YYYY-MM-DD when the caller named one; leave it empty for the soonest
        available times."""
        stop = _budget_exhausted()
        if stop:
            return stop

        t0 = time.perf_counter()
        args = {"day": day}
        start = today_in(config)
        if day:
            try:
                start = date.fromisoformat(day.strip())
            except ValueError:
                out = "That date wasn't understood. Ask the caller out loud which day they mean."
                _record("calcom_find_slots", args, out, 0, False)
                return out
            end = start + timedelta(days=1)
        else:
            end = start + timedelta(days=DEFAULT_LOOKAHEAD_DAYS)

        try:
            by_day = get_slots(
                api_key, event_type_id=event_type_id, start=start, end=end, time_zone=tz_name
            )
        except CalComError as exc:
            ms = int((time.perf_counter() - t0) * 1000)
            out = (
                f"The calendar couldn't be reached ({exc.message}). Say sorry out loud and "
                "offer to follow up by email. Do not retry."
            )
            _record("calcom_find_slots", args, out, ms, False)
            return out

        starts = _offerable(by_day, single_day=bool(day))
        ms = int((time.perf_counter() - t0) * 1000)

        if not starts:
            # Deliberately does NOT say "look again" — an empty day is exactly
            # where a small model starts spinning, re-checking day after day
            # while the caller waits. Hand the turn back to the caller instead.
            out = (
                f"Nothing free on {start.isoformat()}."
                if day
                else f"Nothing free in the next {DEFAULT_LOOKAHEAD_DAYS} days."
            ) + " Say this out loud and ask the caller which other day suits them."
            _record("calcom_find_slots", args, out, ms, True)
            return out

        lines = "\n".join(f"- {_speakable(s, tz)}  (start_time: {s})" for s in starts)
        out = (
            f"Available times (all {tz_name}). Say them naturally; pass the exact "
            f"start_time value to book_meeting:\n{lines}"
        )
        _record("calcom_find_slots", args, out, ms, True)
        return out

    def book_meeting(name: str, email: str, start_time: str) -> str:
        """Book the meeting. `start_time` must be one of the exact start_time
        values returned by find_available_slots."""
        stop = _budget_exhausted()
        if stop:
            return stop

        t0 = time.perf_counter()
        args = {"name": name, "email": email, "start_time": start_time}
        try:
            booking = create_booking(
                api_key,
                event_type_id=event_type_id,
                start=start_time,
                name=name.strip(),
                email=email.strip(),
                time_zone=tz_name,
            )
        except CalComError as exc:
            ms = int((time.perf_counter() - t0) * 1000)
            out = (
                f"The booking did not go through ({exc.message}). Do NOT tell the caller "
                "it's confirmed. Say out loud that the time was just taken and ask which "
                "other day suits them."
            )
            _record("calcom_book_meeting", args, out, ms, False)
            return out

        ms = int((time.perf_counter() - t0) * 1000)
        when = _speakable(booking.get("start") or start_time, tz)
        out = (
            f"Booked. {name} is confirmed for {when} ({tz_name}) and a calendar "
            f"invite is on its way to {email}. Confirm this out loud."
        )
        _record("calcom_book_meeting", args, out, ms, True)
        return out

    return [
        StructuredTool.from_function(
            func=find_available_slots,
            name="find_available_slots",
            description=(
                "Check the calendar for free meeting times. Pass day as YYYY-MM-DD "
                "for a specific date the caller asked about, or leave it empty to get "
                "the soonest available times. Always call this before offering a time."
            ),
        ),
        StructuredTool.from_function(
            func=book_meeting,
            name="book_meeting",
            description=(
                "Book the meeting once the caller has agreed to a specific time. "
                "Requires their full name, their email address, and the exact "
                "start_time value from find_available_slots."
            ),
        ),
    ]
