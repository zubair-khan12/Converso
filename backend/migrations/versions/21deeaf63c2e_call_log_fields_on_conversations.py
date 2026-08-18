"""call log fields on conversations

Turns a Conversation from "a RAG trace happened" into an actual call log. All
of these are filled by Vapi's end-of-call-report webhook
(`POST /api/vapi/webhook/{agent_id}`), except `direction`, which we know as
soon as the call starts.

`duration_seconds` is denormalized rather than derived from
started_at/ended_at so the dashboard's minute totals are a plain SUM that
doesn't silently skip rows missing either timestamp.

Revision ID: 21deeaf63c2e
Revises: b1c4e7f20a15
Create Date: 2026-08-16 21:58:57.058144

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '21deeaf63c2e'
down_revision = 'b1c4e7f20a15'
branch_labels = None
depends_on = None


def upgrade():
    # server_default backfills existing rows in the same statement, so the
    # NOT NULL is satisfiable without a separate UPDATE pass. Every call we've
    # logged so far was inbound (or a web test), so "inbound" is honest.
    op.add_column(
        "conversations",
        sa.Column("direction", sa.String(length=16), nullable=False, server_default="inbound"),
    )
    op.add_column("conversations", sa.Column("duration_seconds", sa.Integer(), nullable=True))
    op.add_column("conversations", sa.Column("ended_reason", sa.String(length=64), nullable=True))
    # Numeric, not Float — this is money Vapi billed.
    op.add_column("conversations", sa.Column("cost_usd", sa.Numeric(precision=10, scale=4), nullable=True))
    op.add_column("conversations", sa.Column("recording_url", sa.Text(), nullable=True))
    op.add_column("conversations", sa.Column("summary", sa.Text(), nullable=True))
    op.add_column("conversations", sa.Column("transcript", sa.Text(), nullable=True))

    # Every dashboard stat is a window over started_at.
    op.create_index(op.f("ix_conversations_started_at"), "conversations", ["started_at"], unique=False)

    # The default has done its backfilling job; the model is now the single
    # place a new row's direction is decided.
    op.alter_column("conversations", "direction", server_default=None)


def downgrade():
    op.drop_index(op.f("ix_conversations_started_at"), table_name="conversations")
    op.drop_column("conversations", "transcript")
    op.drop_column("conversations", "summary")
    op.drop_column("conversations", "recording_url")
    op.drop_column("conversations", "cost_usd")
    op.drop_column("conversations", "ended_reason")
    op.drop_column("conversations", "duration_seconds")
    op.drop_column("conversations", "direction")
