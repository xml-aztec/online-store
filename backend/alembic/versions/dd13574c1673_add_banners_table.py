"""add banners table

Revision ID: dd13574c1673
Revises: 37d7ffafa447
Create Date: 2026-08-03 15:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'dd13574c1673'
down_revision: str | Sequence[str] | None = '37d7ffafa447'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('banners',
    sa.Column('title', sa.String(), nullable=True),
    sa.Column('subtitle', sa.String(), nullable=True),
    sa.Column('link_url', sa.String(), nullable=True),
    sa.Column('button_text', sa.String(), nullable=True),
    sa.Column('s3_key', sa.String(), nullable=False),
    sa.Column('thumbnail_s3_key', sa.String(), nullable=True),
    sa.Column('sort_order', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.execute(
        "CREATE TRIGGER trg_banners_updated_at BEFORE UPDATE ON banners "
        "FOR EACH ROW EXECUTE FUNCTION set_updated_at()"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP TRIGGER IF EXISTS trg_banners_updated_at ON banners")
    op.drop_table('banners')
