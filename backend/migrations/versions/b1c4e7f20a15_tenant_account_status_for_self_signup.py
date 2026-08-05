"""tenant account status for self-signup

Adds the columns that make a tenant a billing/access boundary:
  - status        active | disabled — the switch staff flip when a customer
                  hasn't paid. Every product endpoint checks it.
  - source        signup | admin — how the tenant came to exist, so self-signups
                  are identifiable in the admin panel.
  - trial_ends_at unused by default; when set, the gate treats the account as
                  expired past it, so time-limited trials need no new code.

Additive rather than folded into the initial migration: the initial schema has
already been applied to the deployed database, so editing it would only ever
change new installs. Existing tenants backfill to active/admin, which is what
they are — they were provisioned by staff and are in good standing.

Revision ID: b1c4e7f20a15
Revises: 60846f81001d
"""
from alembic import op
import sqlalchemy as sa

revision = "b1c4e7f20a15"
down_revision = "60846f81001d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default backfills existing rows in the same statement, so the
    # NOT NULL is satisfiable without a separate UPDATE pass.
    op.add_column(
        "tenants",
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
    )
    op.add_column(
        "tenants",
        sa.Column("source", sa.String(length=32), nullable=False, server_default="admin"),
    )
    op.add_column(
        "tenants",
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_tenants_status"), "tenants", ["status"])
    op.create_index(op.f("ix_tenants_source"), "tenants", ["source"])

    # The default has done its backfilling job. Dropping it keeps the model as
    # the single place a new tenant's status is decided — otherwise the DB and
    # app could disagree about what a fresh row starts as.
    op.alter_column("tenants", "status", server_default=None)
    op.alter_column("tenants", "source", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_tenants_source"), table_name="tenants")
    op.drop_index(op.f("ix_tenants_status"), table_name="tenants")
    op.drop_column("tenants", "trial_ends_at")
    op.drop_column("tenants", "source")
    op.drop_column("tenants", "status")
