"""Tenant lifecycle: creating one at signup, and locking one when it's disabled."""
import re
import unicodedata

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..agents.models import Agent
from ..integrations.service import get_vapi_api_key
from ..telephony.models import PhoneNumber
from ..vapi.client import VapiError, update_phone_number
from .models import Tenant

# Leaves room for the "-2" style suffix uniquify() may need to append without
# overflowing the column (slug is String(120)).
_MAX_SLUG_LEN = 110


def slugify(name: str) -> str:
    """A URL-safe slug for an organisation name.

    Non-ASCII is transliterated rather than dropped, so "Café Beta" becomes
    "cafe-beta" instead of "beta" — a tenant whose name is entirely non-ASCII
    would otherwise end up with an empty slug.
    """
    ascii_name = (
        unicodedata.normalize("NFKD", name or "")
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return slug[:_MAX_SLUG_LEN].strip("-")


def unique_slug(db: Session, name: str) -> str:
    """A slug not already taken. `tenants.slug` is unique-indexed, and two
    companies called Acme signing up on the same day is entirely ordinary, so
    collisions are resolved with a counter rather than left to raise."""
    base = slugify(name) or "workspace"
    candidate = base
    n = 2
    while db.execute(
        select(Tenant.id).where(Tenant.slug == candidate)
    ).first() is not None:
        candidate = f"{base}-{n}"
        n += 1
    return candidate


def create_tenant(db: Session, name: str, *, source: str = "signup") -> Tenant:
    """Create an organisation. Does NOT commit — the caller commits the tenant
    and its owner together, so a failure can't leave an empty tenant behind."""
    tenant = Tenant(
        name=name.strip(),
        slug=unique_slug(db, name),
        status="active",
        source=source,
    )
    db.add(tenant)
    # Populate tenant.id without committing, so the owner row can reference it.
    db.flush()
    return tenant


def get_tenant(db: Session, tenant_id) -> Tenant | None:
    return db.get(Tenant, tenant_id)


def count_tenants(db: Session) -> int:
    return db.execute(select(func.count(Tenant.id))).scalar_one()


def suspend_live_resources(db: Session, tenant: Tenant) -> list[str]:
    """Stop a disabled tenant's numbers from taking calls.

    Gating the API is not enough on its own: an inbound call is routed by Vapi
    to the assistant, and if the agent has a knowledge base or scheduling its
    every turn runs through our custom-LLM endpoint on the *platform* OpenAI
    key. A locked-out customer whose phone still answers is a bill we pay.

    Detaching the assistant (rather than deleting the number) is deliberate —
    re-enabling should be reversible, and deleting would release a number the
    tenant may have paid a carrier for. Returns human-readable problems; never
    raises, because this runs from the admin panel's save and a Vapi outage
    must not block disabling an account locally.
    """
    problems: list[str] = []
    numbers = (
        db.execute(
            select(PhoneNumber).where(
                PhoneNumber.tenant_id == tenant.id,
                PhoneNumber.vapi_phone_number_id.isnot(None),
            )
        )
        .scalars()
        .all()
    )
    if not numbers:
        return problems

    api_key = get_vapi_api_key(db, str(tenant.id))
    if not api_key:
        # Nothing we can do remotely; the local flag still blocks the dashboard.
        return [
            "Vapi is not connected for this tenant, so its phone numbers could "
            "not be detached remotely."
        ]

    for number in numbers:
        try:
            update_phone_number(api_key, number.vapi_phone_number_id, {"assistantId": None})
        except VapiError as exc:
            problems.append(f"{number.e164 or number.vapi_phone_number_id}: {exc}")
        else:
            number.is_active = False
    db.flush()
    return problems


def restore_live_resources(db: Session, tenant: Tenant) -> list[str]:
    """Re-attach the tenant's numbers to their agents after re-enabling.

    Only numbers that still point at an agent are restored — one detached by
    hand while the account was disabled stays detached, because re-enabling
    shouldn't silently undo a deliberate change.
    """
    problems: list[str] = []
    numbers = (
        db.execute(
            select(PhoneNumber).where(
                PhoneNumber.tenant_id == tenant.id,
                PhoneNumber.vapi_phone_number_id.isnot(None),
                PhoneNumber.agent_id.isnot(None),
            )
        )
        .scalars()
        .all()
    )
    if not numbers:
        return problems

    api_key = get_vapi_api_key(db, str(tenant.id))
    if not api_key:
        return [
            "Vapi is not connected for this tenant, so its phone numbers could "
            "not be re-attached. Reconnect Vapi and retry each number."
        ]

    for number in numbers:
        agent = db.get(Agent, number.agent_id)
        if agent is None or not agent.vapi_assistant_id:
            continue
        try:
            update_phone_number(
                api_key,
                number.vapi_phone_number_id,
                {"assistantId": agent.vapi_assistant_id},
            )
        except VapiError as exc:
            problems.append(f"{number.e164 or number.vapi_phone_number_id}: {exc}")
        else:
            number.is_active = True
    db.flush()
    return problems
