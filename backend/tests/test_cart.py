import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.catalog.models import Category, Product, ProductVariant
from app.core.security import create_access_token, hash_password
from app.orders.models import PromoCode


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


async def _make_variant(
    db_session: AsyncSession,
    *,
    price: Decimal = Decimal("500.00"),
    stock_qty: int = 10,
    is_active: bool = True,
) -> ProductVariant:
    category = Category(name="Категория", slug=_slug("cat"))
    db_session.add(category)
    await db_session.flush()
    product = Product(category_id=category.id, name="Товар", slug=_slug("product"))
    db_session.add(product)
    await db_session.flush()
    variant = ProductVariant(
        product_id=product.id,
        sku=_slug("sku"),
        price=price,
        stock_qty=stock_qty,
        is_active=is_active,
    )
    db_session.add(variant)
    await db_session.commit()
    return variant


async def _make_user(db_session: AsyncSession, *, password: str = "TestPass123") -> User:
    user = User(
        email=f"user-{uuid.uuid4().hex[:10]}@example.com", password_hash=hash_password(password)
    )
    db_session.add(user)
    await db_session.commit()
    return user


def _auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


@pytest.mark.asyncio
async def test_get_empty_cart_returns_zero_totals(client: httpx.AsyncClient) -> None:
    response = await client.get("/v1/cart")

    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["subtotal"] == "0"
    assert body["discount_amount"] == "0"
    assert body["total"] == "0"
    assert body["promo_code"] is None


@pytest.mark.asyncio
async def test_add_item_creates_cart_entry(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant = await _make_variant(db_session, price=Decimal("500.00"), stock_qty=7)

    response = await client.post(
        "/v1/cart/items", json={"variant_id": str(variant.id), "qty": 2}
    )

    assert response.status_code == 201
    body = response.json()
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["variant_id"] == str(variant.id)
    assert item["qty"] == 2
    assert item["price"] == "500.00"
    assert item["line_total"] == "1000.00"
    assert item["is_available"] is True
    assert item["available_qty"] == 7
    assert body["subtotal"] == "1000.00"
    assert body["total"] == "1000.00"


@pytest.mark.asyncio
async def test_add_item_twice_increments_quantity(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant = await _make_variant(db_session, stock_qty=20)

    await client.post("/v1/cart/items", json={"variant_id": str(variant.id), "qty": 2})
    response = await client.post(
        "/v1/cart/items", json={"variant_id": str(variant.id), "qty": 3}
    )

    body = response.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["qty"] == 5


@pytest.mark.asyncio
async def test_add_item_quantity_capped_at_99(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant = await _make_variant(db_session, stock_qty=999)

    await client.post("/v1/cart/items", json={"variant_id": str(variant.id), "qty": 60})
    response = await client.post(
        "/v1/cart/items", json={"variant_id": str(variant.id), "qty": 60}
    )

    assert response.json()["items"][0]["qty"] == 99


@pytest.mark.asyncio
async def test_add_item_unknown_variant_returns_404(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/v1/cart/items", json={"variant_id": str(uuid.uuid4()), "qty": 1}
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "VARIANT_NOT_FOUND"


@pytest.mark.asyncio
async def test_add_item_beyond_line_limit_returns_422(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variants = []
    for _ in range(50):
        variants.append(await _make_variant(db_session, stock_qty=5))

    for variant in variants:
        response = await client.post(
            "/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1}
        )
        assert response.status_code == 201

    one_more = await _make_variant(db_session, stock_qty=5)
    response = await client.post(
        "/v1/cart/items", json={"variant_id": str(one_more.id), "qty": 1}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "CART_LIMIT_EXCEEDED"


@pytest.mark.asyncio
async def test_update_item_sets_quantity(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant = await _make_variant(db_session, stock_qty=20)
    await client.post("/v1/cart/items", json={"variant_id": str(variant.id), "qty": 2})

    response = await client.patch(f"/v1/cart/items/{variant.id}", json={"qty": 9})

    assert response.status_code == 200
    assert response.json()["items"][0]["qty"] == 9


@pytest.mark.asyncio
async def test_update_item_zero_quantity_removes_item(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant = await _make_variant(db_session, stock_qty=20)
    await client.post("/v1/cart/items", json={"variant_id": str(variant.id), "qty": 2})

    response = await client.patch(f"/v1/cart/items/{variant.id}", json={"qty": 0})

    assert response.status_code == 200
    assert response.json()["items"] == []


@pytest.mark.asyncio
async def test_clear_cart_empties_it(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant = await _make_variant(db_session, stock_qty=20)
    await client.post("/v1/cart/items", json={"variant_id": str(variant.id), "qty": 2})

    clear_response = await client.delete("/v1/cart")
    assert clear_response.status_code == 204

    get_response = await client.get("/v1/cart")
    assert get_response.json()["items"] == []


@pytest.mark.asyncio
async def test_deactivated_variant_reports_unavailable(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant = await _make_variant(db_session, stock_qty=20)
    await client.post("/v1/cart/items", json={"variant_id": str(variant.id), "qty": 2})

    variant.is_active = False
    await db_session.commit()

    response = await client.get("/v1/cart")

    item = response.json()["items"][0]
    assert item["qty"] == 2
    assert item["is_available"] is False
    assert item["available_qty"] == 0


@pytest.mark.asyncio
async def test_out_of_stock_variant_reports_unavailable(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant = await _make_variant(db_session, stock_qty=0)
    await client.post("/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1})

    response = await client.get("/v1/cart")

    item = response.json()["items"][0]
    assert item["is_available"] is False
    assert item["available_qty"] == 0


@pytest.mark.asyncio
async def test_apply_percent_promo_computes_discount(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant = await _make_variant(db_session, price=Decimal("1000.00"), stock_qty=5)
    await client.post("/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1})

    promo = PromoCode(
        code=_slug("promo").upper(), discount_type="percent", discount_value=Decimal("10.00")
    )
    db_session.add(promo)
    await db_session.commit()

    response = await client.post("/v1/cart/promo", json={"code": promo.code.lower()})

    assert response.status_code == 200
    body = response.json()
    assert body["promo_code"] == promo.code
    assert body["discount_amount"] == "100.00"
    assert body["total"] == "900.00"


@pytest.mark.asyncio
async def test_apply_fixed_promo_does_not_exceed_subtotal(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant = await _make_variant(db_session, price=Decimal("50.00"), stock_qty=5)
    await client.post("/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1})

    promo = PromoCode(
        code=_slug("promo").upper(), discount_type="fixed", discount_value=Decimal("500.00")
    )
    db_session.add(promo)
    await db_session.commit()

    response = await client.post("/v1/cart/promo", json={"code": promo.code})

    body = response.json()
    assert body["discount_amount"] == "50.00"
    assert body["total"] == "0.00"


@pytest.mark.asyncio
async def test_apply_promo_not_found(client: httpx.AsyncClient) -> None:
    response = await client.post("/v1/cart/promo", json={"code": "NOPE"})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROMO_NOT_FOUND"


@pytest.mark.asyncio
async def test_apply_inactive_promo_returns_409(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    promo = PromoCode(
        code=_slug("promo").upper(),
        discount_type="percent",
        discount_value=Decimal("10.00"),
        is_active=False,
    )
    db_session.add(promo)
    await db_session.commit()

    response = await client.post("/v1/cart/promo", json={"code": promo.code})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROMO_INACTIVE"


@pytest.mark.asyncio
async def test_apply_expired_promo_returns_409(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    promo = PromoCode(
        code=_slug("promo").upper(),
        discount_type="percent",
        discount_value=Decimal("10.00"),
        ends_at=datetime.now(UTC) - timedelta(days=1),
    )
    db_session.add(promo)
    await db_session.commit()

    response = await client.post("/v1/cart/promo", json={"code": promo.code})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROMO_EXPIRED"


@pytest.mark.asyncio
async def test_apply_not_started_promo_returns_409(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    promo = PromoCode(
        code=_slug("promo").upper(),
        discount_type="percent",
        discount_value=Decimal("10.00"),
        starts_at=datetime.now(UTC) + timedelta(days=1),
    )
    db_session.add(promo)
    await db_session.commit()

    response = await client.post("/v1/cart/promo", json={"code": promo.code})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROMO_NOT_STARTED"


@pytest.mark.asyncio
async def test_apply_promo_below_min_order_total_returns_409(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant = await _make_variant(db_session, price=Decimal("100.00"), stock_qty=5)
    await client.post("/v1/cart/items", json={"variant_id": str(variant.id), "qty": 1})

    promo = PromoCode(
        code=_slug("promo").upper(),
        discount_type="percent",
        discount_value=Decimal("10.00"),
        min_order_total=Decimal("1000.00"),
    )
    db_session.add(promo)
    await db_session.commit()

    response = await client.post("/v1/cart/promo", json={"code": promo.code})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROMO_MIN_ORDER_NOT_MET"


@pytest.mark.asyncio
async def test_apply_promo_uses_exceeded_returns_409(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    promo = PromoCode(
        code=_slug("promo").upper(),
        discount_type="percent",
        discount_value=Decimal("10.00"),
        max_uses=3,
        used_count=3,
    )
    db_session.add(promo)
    await db_session.commit()

    response = await client.post("/v1/cart/promo", json={"code": promo.code})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROMO_USES_EXCEEDED"


@pytest.mark.asyncio
async def test_login_merges_guest_cart_into_user_cart_with_stock_capping(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    variant_a = await _make_variant(db_session, stock_qty=10)
    variant_b = await _make_variant(db_session, stock_qty=3)
    password = "TestPass123"
    user = await _make_user(db_session, password=password)

    # Pre-existing user cart (e.g. from a previous session).
    await client.post(
        "/v1/cart/items",
        json={"variant_id": str(variant_a.id), "qty": 2},
        headers=_auth_headers(user),
    )

    # Guest activity on this browser before logging in.
    await client.post("/v1/cart/items", json={"variant_id": str(variant_a.id), "qty": 6})
    await client.post("/v1/cart/items", json={"variant_id": str(variant_b.id), "qty": 5})

    login_response = await client.post(
        "/v1/auth/login", json={"email": user.email, "password": password}
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]

    merged = await client.get(
        "/v1/cart", headers={"Authorization": f"Bearer {access_token}"}
    )
    items_by_variant = {item["variant_id"]: item for item in merged.json()["items"]}

    assert items_by_variant[str(variant_a.id)]["qty"] == 8
    assert items_by_variant[str(variant_b.id)]["qty"] == 3

    guest_cart = await client.get("/v1/cart")
    assert guest_cart.json()["items"] == []
