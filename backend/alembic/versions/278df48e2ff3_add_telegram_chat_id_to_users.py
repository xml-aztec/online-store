"""add telegram chat id to users

Revision ID: 278df48e2ff3
Revises: dd13574c1673
Create Date: 2026-08-12 16:31:25.231198

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '278df48e2ff3'
down_revision: str | Sequence[str] | None = 'dd13574c1673'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('telegram_chat_id', sa.String(), nullable=True))
    op.create_unique_constraint('uq_users_telegram_chat_id', 'users', ['telegram_chat_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('uq_users_telegram_chat_id', 'users', type_='unique')
    op.drop_column('users', 'telegram_chat_id')
