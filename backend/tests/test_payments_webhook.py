import hashlib
import hmac
import uuid
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.catalog.models import Category, Product, ProductVariant
from app.config import settings
from app.orders.models import Order
from app.payments.models import Payment
from app.payments.service import refund_payment
from app.workers.tasks import process_payment_succeeded

CHECKOUT_BASE = {
    "email": "buyer@example.com",
    "phone": "+996700000000",
    "full_name": "Покупатель Тестов",
    "delivery_method": "pickup",
    "payment_method": "online",
}


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _sign(*, event_id: str, external_id: str, status: str, amount: Decimal) -> str:
    secret = settings.payment_webhook_secret.encode()
    message = f"{event_id}|{external_id}|{status}|{amount}".encode()
    return hmac.new(secret, message, hashlib.sha256).hexdigest()


async def _make_variant(
    db_session: AsyncSession, *, price: Decimal = Decimal("500.00"), stock_qty: int = 10
) -> ProductVariant:
    category = Category(name="Категория", slug=_slug("cat"))
    db_session.add(category)
    await db_session.flush()
    product = Product(category_id=category.id, name="Товар", slug=_slug("product"))
    db_session.add(product)
    await db_session.flush()
    variant = ProductVariant(
        product_id=product.id, sku=_slug("sku"), price=price, stock_qty=stock_qty
    )
    db_session.add(variant)
    await db_session.commit()
    return variant


async def _create_online_order(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> tuple[Order, Payment]:
    variant = await _make_variant(db_session, price=Decimal("500.00"), stock_qty=10)
    await client.post("/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1})

    response = await client.post("/v1/orders", json=CHECKOUT_BASE)
    assert response.status_code == 201
    number = response.json()["number"]

    order = await db_session.scalar(select(Order).where(Order.number == number))
    assert order is not None
    payment = await db_session.scalar(select(Payment).where(Payment.order_id == order.id))
    assert payment is not None
    return order, payment


def _webhook_form(
    payment: Payment, *, status: str, amount: Decimal, event_id: str
) -> dict[str, str]:
    signature = _sign(
        event_id=event_id, external_id=payment.external_id or "", status=status, amount=amount
    )
    return {
        "event_id": event_id,
        "external_id": payment.external_id or "",
        "status": status,
        "amount": str(amount),
        "signature": signature,
    }


@pytest.mark.asyncio
async def test_successful_payment_webhook_moves_order_to_paid(
    client: httpx.AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    order, payment = await _create_online_order(client, db_session)

    response = await client.post(
        "/v1/webhooks/payment/mock",
        data=_webhook_form(
            payment, status="succeeded", amount=order.total, event_id=str(uuid.uuid4())
        ),
    )
    assert response.status_code == 200

    await db_session.refresh(payment)
    assert payment.status == "succeeded"
    assert order.status == "awaiting_payment"  # only flips once the background job runs

    # The webhook only enqueues the (heavier) order transition -- run it here
    # the same way a real worker would, bound to this test's own connection so
    # it can see the not-yet-committed-to-the-real-DB setup above.
    monkeypatch.setattr(
        "app.workers.tasks.async_session_factory",
        async_sessionmaker(
            bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint"
        ),
    )
    await process_payment_succeeded({}, payment_id=str(payment.id))

    await db_session.refresh(order)
    assert order.status == "paid"


@pytest.mark.asyncio
async def test_duplicate_webhook_delivery_processed_once(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    order, payment = await _create_online_order(client, db_session)
    event_id = str(uuid.uuid4())
    form = _webhook_form(payment, status="succeeded", amount=order.total, event_id=event_id)

    first = await client.post("/v1/webhooks/payment/mock", data=form)
    second = await client.post("/v1/webhooks/payment/mock", data=form)

    assert first.status_code == 200
    assert second.status_code == 200

    from app.core.queue import get_arq_pool

    pool = await get_arq_pool()
    jobs = await pool.queued_jobs()
    matching = [
        job
        for job in jobs
        if job.function == "process_payment_succeeded"
        and job.kwargs.get("payment_id") == str(payment.id)
    ]
    assert len(matching) == 1


@pytest.mark.asyncio
async def test_invalid_signature_returns_400(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    order, payment = await _create_online_order(client, db_session)

    form = _webhook_form(
        payment, status="succeeded", amount=order.total, event_id=str(uuid.uuid4())
    )
    form["signature"] = "not-a-real-signature"

    response = await client.post("/v1/webhooks/payment/mock", data=form)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_WEBHOOK_SIGNATURE"

    await db_session.refresh(payment)
    assert payment.status == "created"


@pytest.mark.asyncio
async def test_amount_mismatch_marks_payment_failed_and_logs_error(
    client: httpx.AsyncClient, db_session: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    order, payment = await _create_online_order(client, db_session)
    wrong_amount = order.total + Decimal("1.00")

    with caplog.at_level("ERROR"):
        response = await client.post(
            "/v1/webhooks/payment/mock",
            data=_webhook_form(
                payment, status="succeeded", amount=wrong_amount, event_id=str(uuid.uuid4())
            ),
        )

    assert response.status_code == 200
    await db_session.refresh(payment)
    assert payment.status == "failed"
    assert any("payment_amount_mismatch" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_refund_changes_payment_and_order_status(
    client: httpx.AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    order, payment = await _create_online_order(client, db_session)

    monkeypatch.setattr(
        "app.workers.tasks.async_session_factory",
        async_sessionmaker(
            bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint"
        ),
    )
    await client.post(
        "/v1/webhooks/payment/mock",
        data=_webhook_form(
            payment, status="succeeded", amount=order.total, event_id=str(uuid.uuid4())
        ),
    )
    await process_payment_succeeded({}, payment_id=str(payment.id))
    await db_session.refresh(order)
    assert order.status == "paid"

    await refund_payment(db_session, payment, changed_by=None)

    await db_session.refresh(payment)
    await db_session.refresh(order)
    assert payment.status == "refunded"
    assert order.status == "refunded"
