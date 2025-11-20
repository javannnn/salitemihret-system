"""Add structured sponsorship fields

Revision ID: 4f01e89343bf
Revises: d982f95d92b3
Create Date: 2025-02-14 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "4f01e89343bf"
down_revision = "d982f95d92b3"
branch_labels = None
depends_on = None


pledge_channel_enum = sa.Enum(
    "InPerson",
    "OnlinePortal",
    "Phone",
    "EventBooth",
    name="sponsorship_pledge_channel",
)
reminder_channel_enum = sa.Enum(
    "Email",
    "SMS",
    "Phone",
    "WhatsApp",
    name="sponsorship_reminder_channel",
)
motivation_enum = sa.Enum(
    "HonorMemorial",
    "CommunityOutreach",
    "Corporate",
    "ParishInitiative",
    "Other",
    name="sponsorship_motivation",
)
notes_template_enum = sa.Enum(
    "FollowUp",
    "PaymentIssue",
    "Gratitude",
    "Escalation",
    name="sponsorship_notes_template",
)


def upgrade() -> None:
    bind = op.get_bind()
    pledge_channel_enum.create(bind, checkfirst=True)
    reminder_channel_enum.create(bind, checkfirst=True)
    motivation_enum.create(bind, checkfirst=True)
    notes_template_enum.create(bind, checkfirst=True)

    op.add_column(
        "sponsorships",
        sa.Column("pledge_channel", pledge_channel_enum, nullable=True),
    )
    op.add_column(
        "sponsorships",
        sa.Column("reminder_channel", reminder_channel_enum, nullable=True, server_default="Email"),
    )
    op.add_column(
        "sponsorships",
        sa.Column("motivation", motivation_enum, nullable=True),
    )
    op.add_column(
        "sponsorships",
        sa.Column("notes_template", notes_template_enum, nullable=True),
    )


def downgrade() -> None:
    bind = op.get_bind()

    for column in ("notes_template", "motivation", "reminder_channel", "pledge_channel"):
        op.drop_column("sponsorships", column)

    notes_template_enum.drop(bind, checkfirst=True)
    motivation_enum.drop(bind, checkfirst=True)
    reminder_channel_enum.drop(bind, checkfirst=True)
    pledge_channel_enum.drop(bind, checkfirst=True)
