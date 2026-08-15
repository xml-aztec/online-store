import uuid
from decimal import Decimal
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from structlog.testing import capture_logs

from app.auth.models import User
from app.catalog.models import Category, Product, ProductVariant
from app.config import settings
from app.core.email import send_email
from app.core.queue import get_arq_pool
from app.core.security import decode_email_action_token
from app.orders.models import Order
from app.workers import tasks

CHECKOUT_BASE = {
    "phone": "+996700000000",
    "full_name": "Покупатель Тестов",
    "delivery_method": "pickup",
    "payment_method": "cash_on_delivery",
}


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"


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


# --- app/core/email.py: low-level Resend HTTP call ---


@pytest.mark.asyncio
async def test_send_email_posts_correct_payload_to_resend(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "resend_api_key", "re_test_key")
    monkeypatch.setattr(settings, "email_from", "HobbyLife <onboarding@resend.dev>")

    calls: list[dict[str, Any]] = []

    async def fake_post(self: httpx.AsyncClient, url: str, **kwargs: Any) -> httpx.Response:
        calls.append({"url": url, **kwargs})
        return httpx.Response(200, json={"id": "abc123"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    await send_email(to="buyer@example.com", subject="Тест", html="<p>Привет</p>")

    assert len(calls) == 1
    call = calls[0]
    assert call["url"] == "https://api.resend.com/emails"
    assert call["headers"] == {"Authorization": "Bearer re_test_key"}
    assert call["json"] == {
        "from": "HobbyLife <onboarding@resend.dev>",
        "to": ["buyer@example.com"],
        "subject": "Тест",
        "html": "<p>Привет</p>",
    }


@pytest.mark.asyncio
async def test_send_email_logs_and_swallows_non_2xx_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_post(self: httpx.AsyncClient, url: str, **kwargs: Any) -> httpx.Response:
        return httpx.Response(
            422,
            text='{"message":"invalid `to` field"}',
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    with capture_logs() as captured:
        await send_email(to="not-an-address", subject="Тест", html="<p>Привет</p>")

    errors = [entry for entry in captured if entry["event"] == "resend_send_failed"]
    assert len(errors) == 1
    assert errors[0]["status_code"] == 422
    assert "invalid `to` field" in errors[0]["response_body"]


@pytest.mark.asyncio
async def test_send_email_logs_and_swallows_transport_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_post(self: httpx.AsyncClient, url: str, **kwargs: Any) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    with capture_logs() as captured:
        await send_email(to="buyer@example.com", subject="Тест", html="<p>Привет</p>")

    errors = [entry for entry in captured if entry["event"] == "resend_send_failed"]
    assert len(errors) == 1
    assert "connection refused" in errors[0]["error"]


# --- app/workers/tasks.py: each transactional email, template content ---


def _bind_task_session(monkeypatch: pytest.MonkeyPatch, db_session: AsyncSession) -> None:
    """Each task opens its own session via async_session_factory() -- bind it
    to this test's connection (same pattern as test_orders_status.py's cron
    test) so it can see db_session's not-yet-committed-to-the-real-DB rows."""
    monkeypatch.setattr(
        tasks,
        "async_session_factory",
        async_sessionmaker(
            bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint"
        ),
    )


@pytest.fixture
def sent_emails(
    monkeypatch: pytest.MonkeyPatch, db_session: AsyncSession
) -> list[dict[str, str]]:
    """Mocks app.workers.tasks.send_email (not the Resend HTTP call) --
    these tests are about "does the right task render the right template
    with the right data", already covered at the HTTP layer above."""
    _bind_task_session(monkeypatch, db_session)

    calls: list[dict[str, str]] = []

    async def fake_send_email(to: str, subject: str, html: str) -> None:
        calls.append({"to": to, "subject": subject, "html": html})

    monkeypatch.setattr(tasks, "send_email", fake_send_email)
    return calls


@pytest.mark.asyncio
async def test_verification_email_contains_token_in_link(
    db_session: AsyncSession, sent_emails: list[dict[str, str]]
) -> None:
    user = User(email=_unique_email("verify"), full_name="Айгерим Касымова")
    db_session.add(user)
    await db_session.commit()

    await tasks.send_verification_email({}, user_id=str(user.id), token="tok-verify-123")

    assert len(sent_emails) == 1
    sent = sent_emails[0]
    assert sent["to"] == user.email
    assert "Подтверждение" in sent["subject"]
    assert "verify-email?token=tok-verify-123" in sent["html"]
    assert "Айгерим" in sent["html"]


@pytest.mark.asyncio
async def test_password_reset_email_contains_token_in_link(
    db_session: AsyncSession, sent_emails: list[dict[str, str]]
) -> None:
    user = User(email=_unique_email("reset"), full_name="Данияр Ибраев")
    db_session.add(user)
    await db_session.commit()

    await tasks.send_password_reset_email({}, user_id=str(user.id), token="tok-reset-456")

    assert len(sent_emails) == 1
    sent = sent_emails[0]
    assert sent["to"] == user.email
    assert "Восстановление" in sent["subject"]
    assert "reset-password?token=tok-reset-456" in sent["html"]


@pytest.mark.asyncio
async def test_set_password_email_contains_token_and_order_number(
    db_session: AsyncSession, sent_emails: list[dict[str, str]]
) -> None:
    user = User(email=_unique_email("guest"), full_name="Гость Покупатель", password_hash=None)
    db_session.add(user)
    await db_session.commit()

    await tasks.send_set_password_email(
        {}, user_id=str(user.id), token="tok-setpw-789", order_number="ORD-20260813-00001"
    )

    assert len(sent_emails) == 1
    sent = sent_emails[0]
    assert sent["to"] == user.email
    assert "Установите пароль" in sent["subject"]
    assert "reset-password?token=tok-setpw-789" in sent["html"]
    assert "ORD-20260813-00001" in sent["html"]


@pytest.mark.asyncio
async def test_order_status_email_contains_order_number_status_and_link(
    db_session: AsyncSession, sent_emails: list[dict[str, str]]
) -> None:
    order = Order(
        number=_slug("ORD").upper(),
        email=_unique_email("orderstatus"),
        phone="+996700000000",
        full_name="Покупатель",
        status="shipped",
        payment_method="cash_on_delivery",
        delivery_method="pickup",
        subtotal=Decimal("500.00"),
        total=Decimal("500.00"),
    )
    db_session.add(order)
    await db_session.commit()

    await tasks.send_order_status_email({}, order_id=str(order.id), status="shipped")

    assert len(sent_emails) == 1
    sent = sent_emails[0]
    assert sent["to"] == order.email
    assert order.number in sent["subject"]
    assert order.number in sent["html"]
    assert "заказ отправлен" in sent["html"]
    assert f"account/orders/{order.number}" in sent["html"]


@pytest.mark.asyncio
async def test_email_task_swallows_send_email_failure_without_crashing(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Regression guard for the "must not crash the arq task" requirement --
    # exercised here through the real send_email (mocked at the httpx layer,
    # like the low-level tests above) rather than mocking send_email itself,
    # so this actually proves the failure path all the way through.
    async def fake_post(self: httpx.AsyncClient, url: str, **kwargs: Any) -> httpx.Response:
        return httpx.Response(500, text="internal error", request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    _bind_task_session(monkeypatch, db_session)

    user = User(email=_unique_email("failcase"), full_name="Тест Тестов")
    db_session.add(user)
    await db_session.commit()

    with capture_logs() as captured:
        await tasks.send_verification_email({}, user_id=str(user.id), token="tok-x")

    errors = [entry for entry in captured if entry["event"] == "resend_send_failed"]
    assert len(errors) == 1


# --- Guest checkout provisions a passwordless account + set-password email ---


@pytest.mark.asyncio
async def test_guest_checkout_creates_passwordless_account_and_enqueues_set_password_email(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant = await _make_variant(db_session, price=Decimal("500.00"), stock_qty=10)
    await client.post("/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1})
    email = _unique_email("newguest")

    response = await client.post("/v1/orders", json={**CHECKOUT_BASE, "email": email})

    assert response.status_code == 201
    order_number = response.json()["number"]

    user = await db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    assert user.password_hash is None
    assert user.full_name == CHECKOUT_BASE["full_name"]

    order = await db_session.scalar(select(Order).where(Order.number == order_number))
    assert order is not None
    assert order.user_id == user.id

    pool = await get_arq_pool()
    jobs = await pool.queued_jobs()
    matching = [
        job
        for job in jobs
        if job.function == "send_set_password_email" and job.kwargs.get("user_id") == str(user.id)
    ]
    assert matching, "no send_set_password_email job enqueued for the new guest account"
    assert matching[-1].kwargs["order_number"] == order_number

    token = matching[-1].kwargs["token"]
    payload = decode_email_action_token(token, expected_purpose="password_reset")
    assert payload.user_id == user.id


@pytest.mark.asyncio
async def test_guest_checkout_with_existing_email_does_not_create_duplicate_account(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    existing = User(email=_unique_email("already"), full_name="Уже Зарегистрирован")
    db_session.add(existing)
    await db_session.commit()

    variant = await _make_variant(db_session, price=Decimal("500.00"), stock_qty=10)
    await client.post("/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1})

    response = await client.post(
        "/v1/orders", json={**CHECKOUT_BASE, "email": existing.email}
    )

    assert response.status_code == 201
    order_number = response.json()["number"]

    order = await db_session.scalar(select(Order).where(Order.number == order_number))
    assert order is not None
    # Never silently attach a guest order to somebody else's existing account
    # just because the email at checkout happens to match it.
    assert order.user_id is None

    users = (
        await db_session.scalars(select(User).where(User.email == existing.email))
    ).all()
    assert len(users) == 1

    pool = await get_arq_pool()
    jobs = await pool.queued_jobs()
    matching = [
        job
        for job in jobs
        if job.function == "send_set_password_email"
        and job.kwargs.get("user_id") == str(existing.id)
    ]
    assert not matching
