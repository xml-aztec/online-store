import uuid
from decimal import Decimal
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.catalog.models import Category, Product, ProductVariant
from app.config import settings
from app.core.queue import get_arq_pool
from app.core.redis import get_redis
from app.core.security import create_access_token
from app.orders.models import Order, OrderItem, OrderStatusHistory
from app.telegram import bot_api
from app.telegram import service as telegram_service
from app.telegram.schemas import TelegramCallbackQuery
from app.workers import tasks as worker_tasks


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


async def _make_user(
    session: AsyncSession, *, role: str = "customer", telegram_chat_id: str | None = None
) -> User:
    user = User(
        email=f"{role}-{uuid.uuid4().hex[:10]}@example.com",
        role=role,
        telegram_chat_id=telegram_chat_id,
    )
    session.add(user)
    await session.commit()
    return user


async def _make_variant(session: AsyncSession, *, stock_qty: int = 10) -> ProductVariant:
    category = Category(name="Категория", slug=_slug("cat"))
    session.add(category)
    await session.flush()
    product = Product(category_id=category.id, name="Тестовый товар", slug=_slug("product"))
    session.add(product)
    await session.flush()
    variant = ProductVariant(
        product_id=product.id, sku=_slug("sku"), price=Decimal("500.00"), stock_qty=stock_qty
    )
    session.add(variant)
    await session.commit()
    # notify_low_stock reads variant.product -- populate it the way the real
    # send_telegram_low_stock worker task does (async attribute access on an
    # unloaded lazy relationship would otherwise raise MissingGreenlet).
    await session.refresh(variant, attribute_names=["product"])
    return variant


async def _make_order(
    session: AsyncSession, *, status: str = "processing", quantity: int = 2
) -> Order:
    variant = await _make_variant(session)
    order = Order(
        number=_slug("ORD").upper(),
        email="buyer@example.com",
        phone="+996700000000",
        full_name="Покупатель Тестов",
        status=status,
        payment_method="cash_on_delivery",
        delivery_method="pickup",
        subtotal=Decimal("1000.00"),
        total=Decimal("1000.00"),
    )
    session.add(order)
    await session.flush()
    session.add(
        OrderItem(
            order_id=order.id,
            variant_id=variant.id,
            product_name="Тестовый товар",
            variant_options={"цвет": "красный"},
            sku=variant.sku,
            unit_price=Decimal("500.00"),
            quantity=quantity,
            line_total=Decimal("500.00") * quantity,
        )
    )
    session.add(OrderStatusHistory(order_id=order.id, from_status=None, to_status=status))
    await session.commit()
    # _format_order_message reads order.items -- see the identical reasoning in
    # _make_variant above for why this can't just stay a lazy relationship.
    await session.refresh(order, attribute_names=["items"])
    return order


def _callback(
    *, from_id: int, order_id: uuid.UUID, to_status: str, chat_id: int | None = None
) -> TelegramCallbackQuery:
    # Built from a raw dict + model_validate, same as the real webhook parses
    # Telegram's JSON in app/telegram/router.py -- sidesteps the alias-vs-field-
    # name ("from" is a Python keyword, the model exposes it as from_) friction
    # of constructing this model directly by keyword.
    return TelegramCallbackQuery.model_validate(
        {
            "id": f"cbq-{uuid.uuid4().hex[:8]}",
            "from": {"id": from_id},
            "message": {
                "message_id": 1,
                "chat": {"id": chat_id if chat_id is not None else from_id},
            },
            "data": f"os:{order_id.hex}:{to_status}",
        }
    )


def _update_id() -> int:
    # Redis dedup state (unlike db_session) isn't rolled back between test runs
    # against the same local Redis -- a fixed literal here would make the
    # *first* run's assertions pass and every subsequent run's fail, since the
    # dedup key from before would still be sitting there with its 24h TTL.
    return uuid.uuid4().int % 1_000_000_000


class _FakeBotApi:
    def __init__(self) -> None:
        self.sent_messages: list[dict[str, Any]] = []
        self.edited_messages: list[dict[str, Any]] = []
        self.answered_callbacks: list[dict[str, Any]] = []
        self._next_message_id = 1000

    async def send_message(
        self, chat_id: str, text: str, *, reply_markup: dict[str, Any] | None = None
    ) -> int:
        self._next_message_id += 1
        self.sent_messages.append({"chat_id": chat_id, "text": text, "reply_markup": reply_markup})
        return self._next_message_id

    async def edit_message_text(
        self,
        chat_id: str,
        message_id: int,
        text: str,
        *,
        reply_markup: dict[str, Any] | None = None,
    ) -> None:
        self.edited_messages.append(
            {
                "chat_id": chat_id,
                "message_id": message_id,
                "text": text,
                "reply_markup": reply_markup,
            }
        )

    async def answer_callback_query(
        self, callback_query_id: str, *, text: str | None = None, show_alert: bool = False
    ) -> None:
        self.answered_callbacks.append(
            {"callback_query_id": callback_query_id, "text": text, "show_alert": show_alert}
        )


@pytest.fixture
def fake_bot_api(monkeypatch: pytest.MonkeyPatch) -> _FakeBotApi:
    fake = _FakeBotApi()
    monkeypatch.setattr(bot_api, "send_message", fake.send_message)
    monkeypatch.setattr(bot_api, "edit_message_text", fake.edit_message_text)
    monkeypatch.setattr(bot_api, "answer_callback_query", fake.answer_callback_query)
    return fake


# --- create_link_token / handle_start ---


@pytest.mark.asyncio
async def test_handle_start_valid_token_links_chat_id(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    manager = await _make_user(db_session, role="manager")
    link_url = await telegram_service.create_link_token(manager.id)
    token = link_url.rsplit("start=", 1)[1]
    assert link_url == f"https://t.me/{settings.telegram_bot_username}?start={token}"

    await telegram_service.handle_start(db_session, token=token, chat_id="555001")

    await db_session.refresh(manager)
    assert manager.telegram_chat_id == "555001"
    assert fake_bot_api.sent_messages  # confirmation message sent

    # One-time use: the token is gone even though it hasn't hit its TTL yet.
    redis = get_redis()
    assert await redis.get(f"telegram_link:{token}") is None


@pytest.mark.asyncio
async def test_handle_start_expired_token_does_not_link(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    manager = await _make_user(db_session, role="manager")
    link_url = await telegram_service.create_link_token(manager.id)
    token = link_url.rsplit("start=", 1)[1]
    # Simulates the 10-minute TTL having elapsed without an actual sleep --
    # from Redis's perspective an expired key and a deleted key are identical.
    redis = get_redis()
    await redis.delete(f"telegram_link:{token}")

    await telegram_service.handle_start(db_session, token=token, chat_id="555002")

    await db_session.refresh(manager)
    assert manager.telegram_chat_id is None


@pytest.mark.asyncio
async def test_handle_start_nonexistent_token_does_not_link_and_does_not_crash(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    await telegram_service.handle_start(db_session, token="never-issued-token", chat_id="555003")
    assert fake_bot_api.sent_messages  # tells the user something, doesn't just vanish


@pytest.mark.asyncio
async def test_handle_start_second_user_with_same_chat_id_is_rejected(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    first = await _make_user(db_session, role="manager", telegram_chat_id="555004")
    second = await _make_user(db_session, role="admin")
    link_url = await telegram_service.create_link_token(second.id)
    token = link_url.rsplit("start=", 1)[1]

    await telegram_service.handle_start(db_session, token=token, chat_id="555004")

    await db_session.refresh(second)
    assert second.telegram_chat_id is None
    await db_session.refresh(first)
    assert first.telegram_chat_id == "555004"


# --- callback handling ---


@pytest.mark.asyncio
async def test_callback_from_unlinked_chat_id_does_not_change_order(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    order = await _make_order(db_session, status="paid")

    await telegram_service.handle_callback(
        db_session,
        update_id=_update_id(),
        callback_query=_callback(from_id=999999, order_id=order.id, to_status="processing"),
    )

    await db_session.refresh(order)
    assert order.status == "paid"
    assert fake_bot_api.answered_callbacks[-1]["show_alert"] is True


@pytest.mark.asyncio
async def test_callback_from_customer_role_does_not_change_order(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    # Defense in depth: even if a `customer` somehow got telegram_chat_id set,
    # the callback handler's own role check must still block them.
    await _make_user(db_session, role="customer", telegram_chat_id="555005")
    order = await _make_order(db_session, status="paid")

    await telegram_service.handle_callback(
        db_session,
        update_id=_update_id(),
        callback_query=_callback(from_id=555005, order_id=order.id, to_status="processing"),
    )

    await db_session.refresh(order)
    assert order.status == "paid"


@pytest.mark.asyncio
async def test_callback_with_invalid_transition_does_not_change_order_and_does_not_crash(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    await _make_user(db_session, role="manager", telegram_chat_id="555006")
    order = await _make_order(
        db_session, status="pending"
    )  # only awaiting_payment/cancelled allowed

    await telegram_service.handle_callback(
        db_session,
        update_id=_update_id(),
        callback_query=_callback(from_id=555006, order_id=order.id, to_status="shipped"),
    )

    await db_session.refresh(order)
    assert order.status == "pending"
    last_answer = fake_bot_api.answered_callbacks[-1]
    assert last_answer["show_alert"] is True
    assert last_answer["text"]  # the 409-equivalent message, shown as text


@pytest.mark.asyncio
async def test_duplicate_update_id_is_processed_exactly_once(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    await _make_user(db_session, role="manager", telegram_chat_id="555007")
    order = await _make_order(db_session, status="awaiting_payment")
    callback = _callback(from_id=555007, order_id=order.id, to_status="cancelled")
    update_id = _update_id()

    await telegram_service.handle_callback(db_session, update_id=update_id, callback_query=callback)
    await db_session.refresh(order, attribute_names=["status_history"])
    assert order.status == "cancelled"
    assert len(order.status_history) == 2  # created (None->awaiting_payment) + this transition
    answered_after_first = len(fake_bot_api.answered_callbacks)

    # Telegram redelivering the exact same update -- must be a complete no-op,
    # not even an answerCallbackQuery call (proves the dedup check short-circuits
    # before any further processing, not just that a second transition attempt
    # happens to also fail validation).
    await telegram_service.handle_callback(db_session, update_id=update_id, callback_query=callback)

    await db_session.refresh(order, attribute_names=["status_history"])
    assert order.status == "cancelled"
    assert len(order.status_history) == 2
    assert len(fake_bot_api.answered_callbacks) == answered_after_first


@pytest.mark.asyncio
async def test_successful_callback_matches_rest_endpoint_result(
    client: httpx.AsyncClient, db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    admin = await _make_user(db_session, role="admin")
    await _make_user(db_session, role="manager", telegram_chat_id="555008")

    order_via_rest = await _make_order(db_session, status="paid")
    order_via_telegram = await _make_order(db_session, status="paid")

    rest_response = await client.post(
        f"/v1/admin/orders/{order_via_rest.id}/status",
        json={"to_status": "processing"},
        headers={"Authorization": f"Bearer {create_access_token(admin.id, admin.role)}"},
    )
    assert rest_response.status_code == 200

    await telegram_service.handle_callback(
        db_session,
        update_id=_update_id(),
        callback_query=_callback(
            from_id=555008, order_id=order_via_telegram.id, to_status="processing"
        ),
    )

    await db_session.refresh(order_via_rest, attribute_names=["status_history"])
    await db_session.refresh(order_via_telegram, attribute_names=["status_history"])

    assert order_via_rest.status == order_via_telegram.status == "processing"
    rest_history = [(h.from_status, h.to_status) for h in order_via_rest.status_history]
    telegram_history = [(h.from_status, h.to_status) for h in order_via_telegram.status_history]
    assert rest_history == telegram_history


# --- notifications ---


@pytest.mark.asyncio
async def test_notify_new_order_reaches_only_managers_and_admins(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    await _make_user(db_session, role="customer", telegram_chat_id="777001")
    await _make_user(db_session, role="manager", telegram_chat_id="777002")
    await _make_user(db_session, role="admin", telegram_chat_id="777003")
    await _make_user(db_session, role="manager", telegram_chat_id=None)  # not linked
    inactive_manager = await _make_user(db_session, role="manager", telegram_chat_id="777004")
    inactive_manager.is_active = False
    await db_session.commit()

    order = await _make_order(db_session, status="processing")
    await telegram_service.notify_new_order(db_session, order)

    recipients = {msg["chat_id"] for msg in fake_bot_api.sent_messages}
    assert recipients == {"777002", "777003"}
    # Buttons offered must match the order's current allowed transitions.
    sent = next(m for m in fake_bot_api.sent_messages if m["chat_id"] == "777002")
    assert sent["reply_markup"] is not None


@pytest.mark.asyncio
async def test_notify_status_change_edits_the_tracked_message(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    await _make_user(db_session, role="manager", telegram_chat_id="777005")
    order = await _make_order(db_session, status="paid")

    await telegram_service.notify_new_order(db_session, order)
    assert len(fake_bot_api.sent_messages) == 1

    order.status = "processing"
    await telegram_service.notify_status_change(db_session, order)

    assert len(fake_bot_api.edited_messages) == 1
    edited = fake_bot_api.edited_messages[0]
    assert edited["chat_id"] == "777005"
    assert "Собирается" in edited["text"]


@pytest.mark.asyncio
async def test_notify_status_change_without_prior_new_order_message_is_a_no_op(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    await _make_user(db_session, role="manager", telegram_chat_id="777006")
    order = await _make_order(db_session, status="processing")

    # notify_new_order was never called for this order (e.g. the manager linked
    # Telegram after it was created) -- nothing tracked to edit.
    await telegram_service.notify_status_change(db_session, order)

    assert fake_bot_api.edited_messages == []


@pytest.mark.asyncio
async def test_notify_low_stock_dedupes_within_24h(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    await _make_user(db_session, role="manager", telegram_chat_id="777007")
    variant = await _make_variant(db_session, stock_qty=2)

    await telegram_service.notify_low_stock(db_session, variant)
    await telegram_service.notify_low_stock(db_session, variant)

    matching = [m for m in fake_bot_api.sent_messages if m["chat_id"] == "777007"]
    assert len(matching) == 1


@pytest.mark.asyncio
async def test_send_daily_digest_reaches_only_managers_and_admins(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    await _make_user(db_session, role="customer", telegram_chat_id="777008")
    await _make_user(db_session, role="manager", telegram_chat_id="777009")

    await telegram_service.send_daily_digest(db_session)

    recipients = {msg["chat_id"] for msg in fake_bot_api.sent_messages}
    assert recipients == {"777009"}


# --- checkout/transition_status wiring (arq enqueue side-effects) ---


@pytest.mark.asyncio
async def test_checkout_enqueues_new_order_and_low_stock_jobs(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant = await _make_variant(db_session, stock_qty=settings.telegram_low_stock_threshold + 1)
    await client.post(
        "/v1/cart/items",
        json={"variant_id": str(variant.id), "qty": settings.telegram_low_stock_threshold},
    )

    response = await client.post(
        "/v1/orders",
        json={
            "email": "buyer@example.com",
            "phone": "+996700000000",
            "full_name": "Покупатель",
            "delivery_method": "pickup",
            "payment_method": "cash_on_delivery",
        },
    )
    assert response.status_code == 201
    order_id = response.json()["number"]

    pool = await get_arq_pool()
    jobs = await pool.queued_jobs()
    new_order_jobs = [j for j in jobs if j.function == "send_telegram_new_order"]
    low_stock_jobs = [
        j
        for j in jobs
        if j.function == "send_telegram_low_stock" and j.kwargs.get("variant_id") == str(variant.id)
    ]
    assert new_order_jobs, f"no send_telegram_new_order enqueued for order {order_id}"
    assert low_stock_jobs, (
        "stock dropped to 1 (below default threshold 5) but no low-stock job queued"
    )


@pytest.mark.asyncio
async def test_status_transition_always_enqueues_telegram_status_change(
    db_session: AsyncSession,
) -> None:
    from app.orders import service as orders_service

    order = await _make_order(db_session, status="pending")
    await orders_service.transition_status(
        db_session, order, to_status="awaiting_payment", changed_by=None
    )

    pool = await get_arq_pool()
    jobs = await pool.queued_jobs()
    matching = [
        j
        for j in jobs
        if j.function == "send_telegram_status_change" and j.kwargs.get("order_id") == str(order.id)
    ]
    assert matching


# --- webhook route ---


@pytest.mark.asyncio
async def test_webhook_rejects_missing_or_wrong_secret(client: httpx.AsyncClient) -> None:
    no_header = await client.post("/v1/webhooks/telegram", json={"update_id": 1})
    assert no_header.status_code == 401

    wrong_header = await client.post(
        "/v1/webhooks/telegram",
        json={"update_id": 1},
        headers={"X-Telegram-Bot-Api-Secret-Token": "wrong-secret"},
    )
    assert wrong_header.status_code == 401


@pytest.mark.asyncio
async def test_webhook_accepts_correct_secret_and_links_via_start(
    client: httpx.AsyncClient, db_session: AsyncSession, fake_bot_api: _FakeBotApi
) -> None:
    manager = await _make_user(db_session, role="manager")
    link_url = await telegram_service.create_link_token(manager.id)
    token = link_url.rsplit("start=", 1)[1]

    response = await client.post(
        "/v1/webhooks/telegram",
        json={
            "update_id": 4001,
            "message": {"message_id": 1, "chat": {"id": 888001}, "text": f"/start {token}"},
        },
        headers={"X-Telegram-Bot-Api-Secret-Token": settings.telegram_webhook_secret},
    )
    assert response.status_code == 200

    await db_session.refresh(manager)
    assert manager.telegram_chat_id == "888001"


# --- admin link endpoint ---


@pytest.mark.asyncio
async def test_admin_telegram_link_requires_manager_or_admin(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    customer = await _make_user(db_session, role="customer")
    response = await client.post(
        "/v1/admin/telegram/link",
        headers={"Authorization": f"Bearer {create_access_token(customer.id, customer.role)}"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_telegram_link_returns_deep_link_url(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    manager = await _make_user(db_session, role="manager")
    response = await client.post(
        "/v1/admin/telegram/link",
        headers={"Authorization": f"Bearer {create_access_token(manager.id, manager.role)}"},
    )
    assert response.status_code == 200
    link_url = response.json()["link_url"]
    assert link_url.startswith(f"https://t.me/{settings.telegram_bot_username}?start=")


# --- worker task wrappers (mirrors test_orders_status.py's cancel_expired_orders style) ---


@pytest.mark.asyncio
async def test_send_telegram_new_order_task_loads_order_and_notifies(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    await _make_user(db_session, role="manager", telegram_chat_id="777010")
    order = await _make_order(db_session, status="processing")

    monkeypatch.setattr(
        "app.workers.tasks.async_session_factory",
        async_sessionmaker(
            bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint"
        ),
    )

    await worker_tasks.send_telegram_new_order({}, order_id=str(order.id))

    assert any(m["chat_id"] == "777010" for m in fake_bot_api.sent_messages)


@pytest.mark.asyncio
async def test_send_telegram_daily_digest_task_runs(
    db_session: AsyncSession, fake_bot_api: _FakeBotApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    await _make_user(db_session, role="admin", telegram_chat_id="777011")

    monkeypatch.setattr(
        "app.workers.tasks.async_session_factory",
        async_sessionmaker(
            bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint"
        ),
    )

    await worker_tasks.send_telegram_daily_digest({})

    assert any(m["chat_id"] == "777011" for m in fake_bot_api.sent_messages)
