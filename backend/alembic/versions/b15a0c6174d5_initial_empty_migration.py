"""initial_empty_migration

Revision ID: b15a0c6174d5
Revises: 
Create Date: 2026-07-30 18:22:07.657681

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = 'b15a0c6174d5'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
