import uuid
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.orders.models import Order
from app.payments.models import Payment


async def _make_order(session: AsyncSession) -> Order:
    order = Order(
        number=f"ORD-{uuid.uuid4().hex[:12]}",
        email="guest@example.com",
        phone="+996700000000",
        full_name="Гость",
        payment_method="online",
        delivery_method="pickup",
        subtotal=Decimal("100.00"),
        total=Decimal("100.00"),
    )
    session.add(order)
    await session.flush()
    return order


@pytest.mark.asyncio
async def test_payment_status_check_constraint(db_session: AsyncSession) -> None:
    order = await _make_order(db_session)
    db_session.add(
        Payment(
            order_id=order.id, provider="mock", amount=Decimal("100.00"), status="disputed"
        )
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()
