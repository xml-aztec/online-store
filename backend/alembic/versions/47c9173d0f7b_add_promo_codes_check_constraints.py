"""add_promo_codes_check_constraints

Revision ID: 47c9173d0f7b
Revises: e235d2714586
Create Date: 2026-08-01 15:00:00.891866

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '47c9173d0f7b'
down_revision: str | Sequence[str] | None = 'e235d2714586'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Neither constraint existed before -- a percent promo with discount_value=150
    # would let compute_discount() produce a discount bigger than the subtotal
    # (negative order total). Enforced here so it can never be created, not just
    # capped defensively in application code.
    op.create_check_constraint(
        "ck_promo_codes_discount_value_positive", "promo_codes", "discount_value > 0"
    )
    op.create_check_constraint(
        "ck_promo_codes_percent_discount_max_100",
        "promo_codes",
        "discount_type = 'fixed' OR discount_value <= 100",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_promo_codes_percent_discount_max_100", "promo_codes", type_="check")
    op.drop_constraint("ck_promo_codes_discount_value_positive", "promo_codes", type_="check")
