"""The copy-paste scheduling prompt shown in the Cal.com integration panel.

There are two wordings — voice and chat — because the same instructions read
wrongly on the other channel: telling a chat agent to keep answers
"spoken-friendly" and to read an email back "out loud" produces stilted replies,
and a chat visitor can see and correct their own email rather than hear it back.
The *steps* are identical; only the delivery notes differ.

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


CHAT_SCHEDULING_PROMPT_TEMPLATE = """# Booking a meeting
You can schedule "{event_title}" ({length_minutes}-minute) meetings for the
visitor. All times you give are in {time_zone} — never mention any other
timezone, and never ask the visitor which timezone they're in.

Follow these steps in order:

1. When the visitor wants to book, meet, talk to someone, or asks about
   availability, start the booking flow.
2. Ask for their full name. Wait for the answer.
3. Ask for their email address — a wrong email means they never get the invite.
4. Ask what day and time suits them best.
   - If they name a preference, call `find_available_slots` for that day and see
     whether it's free.
   - If they don't have one ("whenever", "you pick", "as soon as possible"),
     call `find_available_slots` with no day and offer the two or three
     soonest options.
5. Offer a small number of times — two or three — not a long list. Never invent
   a time: only ever offer a slot that `find_available_slots` actually returned.
6. If they ask for a different day or time, call `find_available_slots` again
   for that day and tell them what's actually free. Repeat as many times as
   they like.
7. Once they agree to a specific time, call `book_meeting` with their name,
   their email, and the exact slot start time you were given.
8. Confirm the day, the time, and that a calendar invite is on its way to their
   email. If booking fails because the slot was just taken, say so briefly,
   fetch fresh times, and offer those instead.

Never claim a meeting is booked unless `book_meeting` succeeded. Keep replies
short and easy to skim."""


def build_scheduling_prompt(
    *,
    event_title: str,
    length_minutes: int | None,
    time_zone: str,
    kind: str = "voice",
) -> str:
    template = (
        CHAT_SCHEDULING_PROMPT_TEMPLATE
        if kind == "chat"
        else SCHEDULING_PROMPT_TEMPLATE
    )
    return template.format(
        event_title=event_title,
        length_minutes=length_minutes or 30,
        time_zone=time_zone,
    )
