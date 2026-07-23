"""Insert a little sample data so the admin UI has something to show.

Idempotent-ish: safe to run once on a fresh DB. Run with:
    python seed.py
"""
from werkzeug.security import generate_password_hash

import app.models  # noqa: F401  (register all tables)
from app.agents.models import Agent
from app.auth.models import User
from app.database import SessionLocal
from app.integrations.models import Integration
from app.tenants.models import Tenant


def main() -> None:
    db = SessionLocal()
    try:
        if db.query(Tenant).filter_by(slug="acme").first():
            print("Seed data already present — skipping.")
            return

        tenant = Tenant(name="Acme Corp", slug="acme")
        db.add(tenant)
        db.flush()  # assign tenant.id

        user = User(
            tenant_id=tenant.id,
            email="owner@acme.test",
            password_hash=generate_password_hash("password123"),
            name="Acme Owner",
            role="owner",
        )
        agent = Agent(
            tenant_id=tenant.id,
            name="Acme Front Desk",
            base_prompt="You are Acme's friendly front-desk voice assistant.",
            voice="alloy",
            config={"temperature": 0.4},
        )
        integration = Integration(
            tenant_id=tenant.id,
            provider="calcom",
            credentials={"api_key": "REPLACE_ME"},
            config={"event_type_id": 0},
        )
        db.add_all([user, agent, integration])
        db.commit()
        print(f"Seeded tenant={tenant.slug} user={user.email} agent='{agent.name}'")
    finally:
        db.close()


if __name__ == "__main__":
    main()
