import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from structlog.testing import capture_logs

from app.auth.models import User
from app.catalog.models import Category, Product, ProductVariant
from app.core.queue import get_arq_pool
from app.core.security import create_access_token
from app.exceptions import DomainError
from app.orders import service as orders_service
from app.orders.models import Order, OrderItem, OrderStatusHistory
from app.workers.tasks import cancel_expired_orders


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


async def _make_order_with_items(
    db_session: AsyncSession,
    *,
    status: str = "awaiting_payment",
    stock_qty: int = 10,
    quantity: int = 2,
    expires_at: datetime | None = None,
    user_id: uuid.UUID | None = None,
) -> tuple[Order, ProductVariant]:
    category = Category(name="Категория", slug=_slug("cat"))
    db_session.add(category)
    await db_session.flush()
    product = Product(category_id=category.id, name="Товар", slug=_slug("product"))
    db_session.add(product)
    await db_session.flush()
    variant = ProductVariant(
        product_id=product.id, sku=_slug("sku"), price=Decimal("500.00"), stock_qty=stock_qty
    )
    db_session.add(variant)
    await db_session.flush()

    order = Order(
        number=_slug("ORD").upper(),
        user_id=user_id,
        email="buyer@example.com",
        phone="+996700000000",
        full_name="Покупатель",
        status=status,
        payment_method="cash_on_delivery",
        delivery_method="pickup",
        subtotal=Decimal("1000.00"),
        total=Decimal("1000.00"),
        expires_at=expires_at,
    )
    db_session.add(order)
    await db_session.flush()
    db_session.add(
        OrderItem(
            order_id=order.id,
            variant_id=variant.id,
            product_name=product.name,
            variant_options={},
            sku=variant.sku,
            unit_price=Decimal("500.00"),
            quantity=quantity,
            line_total=Decimal("500.00") * quantity,
        )
    )
    await db_session.commit()
    return order, variant


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("from_status", "to_status"),
    [
        ("awaiting_payment", "processing"),
        ("awaiting_payment", "shipped"),
        ("processing", "paid"),
        ("processing", "delivered"),
        ("shipped", "cancelled"),
        ("delivered", "cancelled"),
        ("cancelled", "processing"),
        ("refunded", "paid"),
    ],
)
async def test_forbidden_status_transition_returns_409(
    db_session: AsyncSession, from_status: str, to_status: str
) -> None:
    order, _ = await _make_order_with_items(db_session, status=from_status)

    with pytest.raises(DomainError) as exc_info:
        await orders_service.transition_status(
            db_session, order, to_status=to_status, changed_by=None
        )

    assert exc_info.value.code == "INVALID_STATUS_TRANSITION"
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_allowed_transition_writes_history(db_session: AsyncSession) -> None:
    order, _ = await _make_order_with_items(db_session, status="awaiting_payment")

    await orders_service.transition_status(db_session, order, to_status="paid", changed_by=None)

    assert order.status == "paid"
    history = (
        await db_session.scalars(
            select(OrderStatusHistory).where(OrderStatusHistory.order_id == order.id)
        )
    ).all()
    assert len(history) == 1
    assert history[0].from_status == "awaiting_payment"
    assert history[0].to_status == "paid"


@pytest.mark.asyncio
async def test_allowed_transition_logs_audit_event(db_session: AsyncSession) -> None:
    # ТЗ 8: every order status transition is audit-logged.
    order, _ = await _make_order_with_items(db_session, status="awaiting_payment")
    changer = User(email=f"manager-{uuid.uuid4().hex[:10]}@example.com", role="manager")
    db_session.add(changer)
    await db_session.flush()

    with capture_logs() as captured:
        await orders_service.transition_status(
            db_session, order, to_status="paid", changed_by=changer.id
        )

    entries = [entry for entry in captured if entry["event"] == "order_status_transition"]
    assert len(entries) == 1
    assert entries[0]["order_id"] == str(order.id)
    assert entries[0]["from_status"] == "awaiting_payment"
    assert entries[0]["to_status"] == "paid"
    assert entries[0]["changed_by"] == str(changer.id)


@pytest.mark.asyncio
async def test_cancelling_restores_stock(db_session: AsyncSession) -> None:
    order, variant = await _make_order_with_items(
        db_session, status="awaiting_payment", stock_qty=5, quantity=2
    )

    await orders_service.transition_status(
        db_session, order, to_status="cancelled", changed_by=None
    )

    await db_session.refresh(variant)
    assert variant.stock_qty == 7


@pytest.mark.asyncio
async def test_transition_to_notify_status_enqueues_email(db_session: AsyncSession) -> None:
    order, _ = await _make_order_with_items(db_session, status="awaiting_payment")

    await orders_service.transition_status(db_session, order, to_status="paid", changed_by=None)

    pool = await get_arq_pool()
    jobs = await pool.queued_jobs()
    matching = [
        job
        for job in jobs
        if job.function == "send_order_status_email" and job.kwargs.get("order_id") == str(order.id)
    ]
    assert matching


@pytest.mark.asyncio
async def test_transition_to_non_notify_status_does_not_enqueue_email(
    db_session: AsyncSession,
) -> None:
    order, _ = await _make_order_with_items(db_session, status="paid")

    await orders_service.transition_status(
        db_session, order, to_status="processing", changed_by=None
    )

    pool = await get_arq_pool()
    jobs = await pool.queued_jobs()
    matching = [
        job
        for job in jobs
        if job.function == "send_order_status_email" and job.kwargs.get("order_id") == str(order.id)
    ]
    assert not matching


@pytest.mark.asyncio
async def test_customer_cancel_allowed_from_awaiting_payment(db_session: AsyncSession) -> None:
    order, variant = await _make_order_with_items(
        db_session, status="awaiting_payment", stock_qty=5, quantity=2
    )

    await orders_service.cancel_order(db_session, order, changed_by=None)

    assert order.status == "cancelled"
    await db_session.refresh(variant)
    assert variant.stock_qty == 7


@pytest.mark.asyncio
async def test_customer_cancel_forbidden_from_processing(db_session: AsyncSession) -> None:
    order, _ = await _make_order_with_items(db_session, status="processing")

    with pytest.raises(DomainError) as exc_info:
        await orders_service.cancel_order(db_session, order, changed_by=None)

    assert exc_info.value.code == "ORDER_NOT_CANCELLABLE"


@pytest.mark.asyncio
async def test_cron_cancels_expired_orders_and_restores_stock(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    expired_order, expired_variant = await _make_order_with_items(
        db_session,
        status="awaiting_payment",
        stock_qty=3,
        quantity=2,
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    fresh_order, fresh_variant = await _make_order_with_items(
        db_session,
        status="awaiting_payment",
        stock_qty=3,
        quantity=2,
        expires_at=datetime.now(UTC) + timedelta(minutes=29),
    )

    # The cron task opens its own session via async_session_factory, as a real
    # worker process would -- bind it to this test's connection so it can see
    # the (as yet uncommitted-to-the-real-DB) setup rows above.
    monkeypatch.setattr(
        "app.workers.tasks.async_session_factory",
        async_sessionmaker(
            bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint"
        ),
    )

    await cancel_expired_orders({})

    await db_session.refresh(expired_order)
    await db_session.refresh(fresh_order)
    await db_session.refresh(expired_variant)
    await db_session.refresh(fresh_variant)

    assert expired_order.status == "cancelled"
    assert expired_variant.stock_qty == 5
    assert fresh_order.status == "awaiting_payment"
    assert fresh_variant.stock_qty == 3


@pytest.mark.asyncio
async def test_guest_order_lookup_requires_matching_email(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    order, _ = await _make_order_with_items(db_session, status="processing")

    ok = await client.get(f"/v1/orders/{order.number}", params={"email": order.email})
    assert ok.status_code == 200
    assert ok.json()["number"] == order.number

    wrong_email = await client.get(
        f"/v1/orders/{order.number}", params={"email": "someone-else@example.com"}
    )
    assert wrong_email.status_code == 404
    assert wrong_email.json()["error"]["code"] == "ORDER_NOT_FOUND"

    wrong_number = await client.get("/v1/orders/ORD-DOES-NOT-EXIST", params={"email": order.email})
    assert wrong_number.status_code == 404


@pytest.mark.asyncio
async def test_me_orders_list_and_detail_and_cancel(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = User(email=f"user-{uuid.uuid4().hex[:10]}@example.com")
    db_session.add(user)
    await db_session.flush()
    order, variant = await _make_order_with_items(
        db_session, status="awaiting_payment", stock_qty=5, quantity=2, user_id=user.id
    )
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}

    list_response = await client.get("/v1/me/orders", headers=headers)
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1
    assert list_response.json()["items"][0]["number"] == order.number

    detail_response = await client.get(f"/v1/me/orders/{order.number}", headers=headers)
    assert detail_response.status_code == 200
    assert len(detail_response.json()["items"]) == 1

    cancel_response = await client.post(f"/v1/me/orders/{order.number}/cancel", headers=headers)
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"

    await db_session.refresh(variant)
    assert variant.stock_qty == 7


@pytest.mark.asyncio
async def test_me_orders_does_not_leak_other_users_orders(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    owner = User(email=f"owner-{uuid.uuid4().hex[:10]}@example.com")
    intruder = User(email=f"intruder-{uuid.uuid4().hex[:10]}@example.com")
    db_session.add_all([owner, intruder])
    await db_session.flush()
    order, _ = await _make_order_with_items(db_session, status="processing", user_id=owner.id)

    intruder_headers = {
        "Authorization": f"Bearer {create_access_token(intruder.id, intruder.role)}"
    }
    response = await client.get(f"/v1/me/orders/{order.number}", headers=intruder_headers)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ORDER_NOT_FOUND"
