"""reconcile reviews and banners with tz

Revision ID: 336ec8894286
Revises: ceba4fef01ff
Create Date: 2026-08-13 17:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '336ec8894286'
down_revision: str | Sequence[str] | None = 'ceba4fef01ff'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # ТЗ 5.7 / 4: "Проверенная покупка" badge -- which delivered order made
    # this reviewer eligible. ON DELETE SET NULL: if the order is ever
    # removed, the review itself survives, it just stops showing the badge.
    op.add_column('reviews', sa.Column('order_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'reviews_order_id_fkey', 'reviews', 'orders', ['order_id'], ['id'], ondelete='SET NULL'
    )

    # ТЗ 4 / 7.1: scheduled publish/unpublish for homepage banners.
    op.add_column('banners', sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('banners', sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('banners', 'ends_at')
    op.drop_column('banners', 'starts_at')

    op.drop_constraint('reviews_order_id_fkey', 'reviews', type_='foreignkey')
    op.drop_column('reviews', 'order_id')
