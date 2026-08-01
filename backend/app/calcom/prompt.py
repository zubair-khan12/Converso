"""The copy-paste scheduling prompt shown in the Cal.com integration panel.

The tenant pastes this into their agent's base prompt. It's deliberately plain
text (no template variables left for the tenant to fill in) so "copy → paste →
call" is the whole setup: everything specific to their account — event name,
duration, timezone — is baked in when the snippet is generated.

The two tool names below must match the tools built in
`app/vapi/scheduling_tools.py`, since the prompt tells the model when to call
them by name.
"""

SCHEDULING_PROMPT_TEMPLATE = """# Booking a meeting
You can schedule "{event_title}" ({length_minutes}-minute) meetings for the
caller. All times you say out loud are in {time_zone} — never mention any other
timezone, and never ask the caller which timezone they're in.

Follow these steps in order:

1. When the caller wants to book, meet, talk to someone, or asks about
   availability, start the booking flow.
2. Ask for their full name. Wait for the answer.
3. Ask for their email address. Read it back to confirm you heard it correctly,
   spelling it out if needed — a wrong email means they never get the invite.
4. Ask what day and time suits them best.
   - If they name a preference, call `find_available_slots` for that day and see
     whether it's free.
   - If they don't have one ("whenever", "you pick", "as soon as possible"),
     call `find_available_slots` with no day and offer the two or three
     soonest options.
5. Offer times conversationally — "I have Tuesday at 2pm or 3:30pm" — not as a
   long list. Never invent a time: only ever offer a slot that
   `find_available_slots` actually returned.
6. If the caller asks for a different day or time, call `find_available_slots`
   again for that day and tell them what's actually free. Repeat as many times
   as they like.
7. Once they agree to a specific time, call `book_meeting` with their name,
   their email, and the exact slot start time you were given.
8. Confirm out loud: the day, the time, and that a calendar invite is on its way
   to their email. If booking fails because the slot was just taken, apologise
   briefly, fetch fresh times, and offer those instead.

Never claim a meeting is booked unless `book_meeting` succeeded. Keep every turn
short and spoken-friendly — this is a phone call, not a form."""


def build_scheduling_prompt(*, event_title: str, length_minutes: int | None, time_zone: str) -> str:
    return SCHEDULING_PROMPT_TEMPLATE.format(
        event_title=event_title,
        length_minutes=length_minutes or 30,
        time_zone=time_zone,
    )
