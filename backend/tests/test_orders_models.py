import uuid
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.orders.models import Order, OrderItem, PromoCode


def _order_kwargs(**overrides: object) -> dict[str, object]:
    kwargs: dict[str, object] = {
        "number": f"ORD-{uuid.uuid4().hex[:12]}",
        "email": "guest@example.com",
        "phone": "+996700000000",
        "full_name": "Гость",
        "payment_method": "cash_on_delivery",
        "delivery_method": "pickup",
        "subtotal": Decimal("0"),
        "total": Decimal("0"),
    }
    kwargs.update(overrides)
    return kwargs


async def _make_order(session: AsyncSession, **overrides: object) -> Order:
    order = Order(**_order_kwargs(**overrides))
    session.add(order)
    await session.flush()
    return order


@pytest.mark.asyncio
async def test_order_status_check_constraint(db_session: AsyncSession) -> None:
    db_session.add(Order(**_order_kwargs(status="in_orbit")))

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_order_delivery_method_check_constraint(db_session: AsyncSession) -> None:
    db_session.add(Order(**_order_kwargs(delivery_method="teleport")))

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_order_payment_method_check_constraint(db_session: AsyncSession) -> None:
    db_session.add(Order(**_order_kwargs(payment_method="crypto")))

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_order_item_quantity_check_constraint(db_session: AsyncSession) -> None:
    order = await _make_order(db_session)
    db_session.add(
        OrderItem(
            order_id=order.id,
            product_name="Контейнер пищевой 1л",
            sku="sku-1",
            unit_price=Decimal("100.00"),
            quantity=0,
            line_total=Decimal("0.00"),
        )
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_promo_code_discount_type_check_constraint(db_session: AsyncSession) -> None:
    db_session.add(
        PromoCode(code="BADTYPE", discount_type="coupon", discount_value=Decimal("10.00"))
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()
