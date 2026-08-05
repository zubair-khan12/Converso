"""Outbound notifications to platform staff.

Deliberately one small function behind which the transport can change. Today
it's SMTP; swapping in Resend/Postmark or a Slack webhook later means editing
`_send` and nothing else.

**The database is the source of truth, not the email.** A signup is recorded by
its `Tenant`/`User` rows regardless of whether this succeeds — the email is a
nudge so you notice it today, not the record itself. That's why every failure
here is swallowed and printed: a mail outage must never turn a successful
signup into a 500 for the customer.
"""
import smtplib
import traceback
from email.message import EmailMessage

from ..config import settings


def _send(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        smtp.starttls()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(msg)


def notify_admin(subject: str, body: str) -> None:
    """Tell platform staff something happened. Never raises.

    Falls back to the server console when mail isn't configured, so local
    development still shows the notification rather than silently doing
    nothing and looking like a bug.
    """
    recipient = (settings.ADMIN_NOTIFY_EMAIL or "").strip()
    if not recipient or not settings.SMTP_HOST:
        print(f"\n[notify] (email not configured) {subject}\n{body}\n")
        return

    try:
        _send(recipient, subject, body)
    except Exception:
        print(f"[notify] failed to email admin about: {subject}")
        traceback.print_exc()


def notify_admin_of_signup(*, email: str, name: str | None, org: str, slug: str) -> None:
    """The new-signup alert. Called from a background task so a slow SMTP
    handshake never sits in front of the customer's signup response."""
    dashboard = f"{settings.public_base_url}/admin/tenant/list"
    notify_admin(
        subject=f"New Converso signup: {org}",
        body=(
            f"A new organisation just signed up.\n\n"
            f"  Organisation : {org}  ({slug})\n"
            f"  Name         : {name or '—'}\n"
            f"  Email        : {email}\n\n"
            f"The account is active immediately. Disable it from the admin "
            f"panel if they don't convert:\n  {dashboard}\n"
        ),
    )
