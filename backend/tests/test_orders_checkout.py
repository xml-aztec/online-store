import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.catalog.models import Category, Product, ProductVariant
from app.core.redis import get_redis
from app.core.security import create_access_token, hash_password
from app.database import async_session_factory
from app.exceptions import DomainError
from app.orders import service as orders_service
from app.orders.models import Order, PromoCode
from app.payments.models import Payment

CHECKOUT_BASE = {
    "email": "buyer@example.com",
    "phone": "+996700000000",
    "full_name": "Покупатель Тестов",
    "delivery_method": "pickup",
    "payment_method": "cash_on_delivery",
}


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


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


async def _make_user(db_session: AsyncSession, *, password: str = "TestPass123") -> User:
    user = User(
        email=f"buyer-{uuid.uuid4().hex[:10]}@example.com", password_hash=hash_password(password)
    )
    db_session.add(user)
    await db_session.commit()
    return user


def _auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


@pytest.mark.asyncio
async def test_checkout_config_reports_available_payment_methods_and_tariffs(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/v1/checkout/config")

    assert response.status_code == 200
    body = response.json()
    assert "cash_on_delivery" in body["payment_methods"]
    assert "online" in body["payment_methods"]
    assert Decimal(body["courier_delivery_cost"]) == Decimal("150")
    assert Decimal(body["free_delivery_threshold"]) == Decimal("3000")


@pytest.mark.asyncio
async def test_checkout_requires_authentication(client: httpx.AsyncClient) -> None:
    response = await client.post("/v1/orders", json=CHECKOUT_BASE)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "NOT_AUTHENTICATED"


@pytest.mark.asyncio
async def test_checkout_with_empty_cart_returns_409(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    response = await client.post("/v1/orders", json=CHECKOUT_BASE, headers=_auth_headers(user))

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMPTY_CART"


@pytest.mark.asyncio
async def test_order_creation_rate_limited_after_10_per_hour(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _auth_headers(user)
    # ТЗ 5.5: 10 order creations / hour / IP. The rate-limit check runs before
    # cart/stock logic, so an empty cart (409) still counts against the limit.
    for _ in range(10):
        response = await client.post("/v1/orders", json=CHECKOUT_BASE, headers=headers)
        assert response.status_code == 409

    response = await client.post("/v1/orders", json=CHECKOUT_BASE, headers=headers)

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"


@pytest.mark.asyncio
async def test_cash_on_delivery_checkout_goes_straight_to_processing(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _auth_headers(user)
    variant = await _make_variant(db_session, price=Decimal("500.00"), stock_qty=10)
    await client.post(
        "/v1/cart/items", json={"variant_id": str(variant.id), "qty": 2}, headers=headers
    )

    response = await client.post("/v1/orders", json=CHECKOUT_BASE, headers=headers)

    assert response.status_code == 201
    body = response.json()
    assert body["number"].startswith("ORD-")
    assert body["payment_url"] is None

    order = await db_session.scalar(select(Order).where(Order.number == body["number"]))
    assert order is not None
    assert order.status == "processing"
    assert order.subtotal == Decimal("1000.00")
    assert order.expires_at is None
    assert order.user_id == user.id

    await db_session.refresh(variant)
    assert variant.stock_qty == 8

    cart_after = await client.get("/v1/cart", headers=headers)
    assert cart_after.json()["items"] == []


@pytest.mark.asyncio
async def test_online_checkout_sets_awaiting_payment_and_creates_payment(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _auth_headers(user)
    variant = await _make_variant(db_session, price=Decimal("500.00"), stock_qty=10)
    await client.post(
        "/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1}, headers=headers
    )

    response = await client.post(
        "/v1/orders", json={**CHECKOUT_BASE, "payment_method": "online"}, headers=headers
    )

    assert response.status_code == 201
    body = response.json()
    assert body["payment_url"] is not None

    order = await db_session.scalar(select(Order).where(Order.number == body["number"]))
    assert order is not None
    assert order.status == "awaiting_payment"
    assert order.expires_at is not None
    assert order.expires_at - datetime.now(UTC) < timedelta(minutes=31)

    payment = await db_session.scalar(select(Payment).where(Payment.order_id == order.id))
    assert payment is not None
    assert payment.amount == order.total
    assert payment.status == "created"


@pytest.mark.asyncio
async def test_courier_without_address_returns_422(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _auth_headers(user)
    variant = await _make_variant(db_session, stock_qty=10)
    await client.post(
        "/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1}, headers=headers
    )

    response = await client.post(
        "/v1/orders", json={**CHECKOUT_BASE, "delivery_method": "courier"}, headers=headers
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "DELIVERY_ADDRESS_REQUIRED"


@pytest.mark.asyncio
async def test_courier_delivery_cost_applied_below_free_threshold(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _auth_headers(user)
    variant = await _make_variant(db_session, price=Decimal("100.00"), stock_qty=10)
    await client.post(
        "/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1}, headers=headers
    )

    response = await client.post(
        "/v1/orders",
        json={
            **CHECKOUT_BASE,
            "delivery_method": "courier",
            "address": {"city": "Бишкек", "street": "Тестовая", "building": "1"},
        },
        headers=headers,
    )

    order = await db_session.scalar(
        select(Order).where(Order.number == response.json()["number"])
    )
    assert order is not None
    assert order.delivery_cost == Decimal("150.00")
    assert order.total == Decimal("250.00")


@pytest.mark.asyncio
async def test_courier_delivery_free_above_threshold(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _auth_headers(user)
    variant = await _make_variant(db_session, price=Decimal("5000.00"), stock_qty=10)
    await client.post(
        "/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1}, headers=headers
    )

    response = await client.post(
        "/v1/orders",
        json={
            **CHECKOUT_BASE,
            "delivery_method": "courier",
            "address": {"city": "Бишкек", "street": "Тестовая", "building": "1"},
        },
        headers=headers,
    )

    order = await db_session.scalar(
        select(Order).where(Order.number == response.json()["number"])
    )
    assert order is not None
    assert order.delivery_cost == Decimal("0.00")


@pytest.mark.asyncio
async def test_checkout_applies_promo_discount_and_increments_used_count(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _auth_headers(user)
    variant = await _make_variant(db_session, price=Decimal("1000.00"), stock_qty=10)
    await client.post(
        "/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1}, headers=headers
    )

    promo = PromoCode(
        code=_slug("promo").upper(), discount_type="percent", discount_value=Decimal("10.00")
    )
    db_session.add(promo)
    await db_session.commit()
    await client.post("/v1/cart/promo", json={"code": promo.code}, headers=headers)

    response = await client.post("/v1/orders", json=CHECKOUT_BASE, headers=headers)

    order = await db_session.scalar(
        select(Order).where(Order.number == response.json()["number"])
    )
    assert order is not None
    assert order.discount_amount == Decimal("100.00")
    assert order.total == Decimal("900.00")

    await db_session.refresh(promo)
    assert promo.used_count == 1


@pytest.mark.asyncio
async def test_checkout_ignores_client_submitted_price_and_recomputes_from_db(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _auth_headers(user)
    variant = await _make_variant(db_session, price=Decimal("500.00"), stock_qty=10)
    await client.post(
        "/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1}, headers=headers
    )

    # Price changes after add-to-cart but before checkout -- the order must use
    # the DB price at checkout time, not whatever the cart saw earlier.
    variant.price = Decimal("750.00")
    await db_session.commit()

    response = await client.post(
        "/v1/orders",
        json={**CHECKOUT_BASE, "price": "1.00", "total": "1.00"},
        headers=headers,
    )

    assert response.status_code == 201
    order = await db_session.scalar(
        select(Order).where(Order.number == response.json()["number"])
    )
    assert order is not None
    assert order.subtotal == Decimal("750.00")
    assert order.total == Decimal("750.00")


@pytest.mark.asyncio
async def test_checkout_out_of_stock_returns_409_and_leaves_stock_untouched(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _auth_headers(user)
    variant = await _make_variant(db_session, stock_qty=1)
    await client.post(
        "/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1}, headers=headers
    )

    variant.stock_qty = 0
    await db_session.commit()

    response = await client.post("/v1/orders", json=CHECKOUT_BASE, headers=headers)

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "OUT_OF_STOCK"
    assert body["error"]["details"]["unavailable_items"][0]["variant_id"] == str(variant.id)

    await db_session.refresh(variant)
    assert variant.stock_qty == 0


@pytest.mark.asyncio
async def test_concurrent_checkout_of_last_unit_exactly_one_succeeds() -> None:
    # Deliberately bypasses the shared client/db_session fixtures: those share a
    # single transaction/connection for the whole test, so two "concurrent" calls
    # through them wouldn't exercise genuine overlapping Postgres transactions.
    # Proving the atomic UPDATE ... WHERE stock_qty >= :qty is race-safe requires
    # two real, independent sessions racing on the same row.
    async with async_session_factory() as setup_session:
        category = Category(name="Категория", slug=_slug("cat"))
        setup_session.add(category)
        await setup_session.flush()
        product = Product(category_id=category.id, name="Товар", slug=_slug("product"))
        setup_session.add(product)
        await setup_session.flush()
        variant = ProductVariant(
            product_id=product.id, sku=_slug("sku"), price=Decimal("500.00"), stock_qty=1
        )
        setup_session.add(variant)
        await setup_session.commit()
        variant_id = variant.id
        product_id = product.id
        category_id = category.id

    buyer_email = f"concurrent-{uuid.uuid4().hex[:8]}@example.com"
    cart_key_a = f"cart:{uuid.uuid4()}"
    cart_key_b = f"cart:{uuid.uuid4()}"
    redis = get_redis()
    await redis.hset(cart_key_a, str(variant_id), "1")
    await redis.hset(cart_key_b, str(variant_id), "1")

    async def attempt(cart_key: str) -> Order:
        async with async_session_factory() as session:
            order, _ = await orders_service.create_order(
                session,
                cart_key=cart_key,
                user_id=None,
                email=buyer_email,
                phone="+996700000000",
                full_name="Покупатель",
                delivery_method="pickup",
                address=None,
                payment_method="cash_on_delivery",
                comment=None,
            )
            return order

    try:
        results = await asyncio.gather(
            attempt(cart_key_a), attempt(cart_key_b), return_exceptions=True
        )

        successes = [r for r in results if isinstance(r, Order)]
        failures = [r for r in results if isinstance(r, DomainError)]
        assert len(successes) == 1, results
        assert len(failures) == 1, results
        assert failures[0].code == "OUT_OF_STOCK"

        async with async_session_factory() as verify_session:
            refreshed_variant = await verify_session.get(ProductVariant, variant_id)
            assert refreshed_variant is not None
            assert refreshed_variant.stock_qty == 0

            orders_count = await verify_session.scalar(
                select(func.count()).select_from(Order).where(Order.email == buyer_email)
            )
            assert orders_count == 1
    finally:
        await redis.delete(cart_key_a, cart_key_b)
        async with async_session_factory() as cleanup_session:
            await cleanup_session.execute(delete(Order).where(Order.email == buyer_email))
            await cleanup_session.execute(delete(Product).where(Product.id == product_id))
            await cleanup_session.execute(delete(Category).where(Category.id == category_id))
            await cleanup_session.commit()
