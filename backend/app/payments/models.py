import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TimestampedBase


class Payment(TimestampedBase):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("provider", "external_id", name="uq_payments_provider_external_id"),
        CheckConstraint(
            "status IN ('created','pending','succeeded','failed','refunded')",
            name="ck_payments_status",
        ),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(nullable=False)
    external_id: Mapped[str | None] = mapped_column(nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(nullable=False, server_default="created")
    raw_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class PaymentEvent(TimestampedBase):
    __tablename__ = "payment_events"
    __table_args__ = (
        UniqueConstraint("provider", "event_id", name="uq_payment_events_provider_event_id"),
    )

    provider: Mapped[str] = mapped_column(nullable=False)
    event_id: Mapped[str] = mapped_column(nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
