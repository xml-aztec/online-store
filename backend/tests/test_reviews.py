import uuid
from decimal import Decimal

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.catalog.models import Category, Product, ProductVariant
from app.core.security import create_access_token
from app.orders.models import Order, OrderItem


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


async def _make_user(db_session: AsyncSession, *, role: str = "customer") -> User:
    user = User(email=f"{_slug('user')}@example.com", full_name="Айгерим Касымова", role=role)
    db_session.add(user)
    await db_session.commit()
    return user


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


async def _make_product(db_session: AsyncSession) -> tuple[Product, ProductVariant]:
    category = Category(name="Категория", slug=_slug("cat"))
    db_session.add(category)
    await db_session.flush()
    product = Product(category_id=category.id, name="Товар", slug=_slug("product"))
    db_session.add(product)
    await db_session.flush()
    variant = ProductVariant(
        product_id=product.id, sku=_slug("sku"), price=Decimal("100.00"), stock_qty=5
    )
    db_session.add(variant)
    await db_session.commit()
    return product, variant


async def _make_delivered_order(
    db_session: AsyncSession, *, user: User, product: Product, variant: ProductVariant
) -> Order:
    order = Order(
        number=_slug("ORD").upper(),
        user_id=user.id,
        email=user.email,
        phone="+996700000000",
        full_name=user.full_name,
        status="delivered",
        payment_method="cash_on_delivery",
        delivery_method="pickup",
        subtotal=variant.price,
        total=variant.price,
    )
    db_session.add(order)
    await db_session.flush()
    db_session.add(
        OrderItem(
            order_id=order.id,
            variant_id=variant.id,
            product_id=product.id,
            product_name=product.name,
            variant_options=variant.options,
            sku=variant.sku,
            unit_price=variant.price,
            quantity=1,
            line_total=variant.price,
        )
    )
    await db_session.commit()
    return order


@pytest.mark.asyncio
async def test_ineligible_user_cannot_create_review(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    product, _ = await _make_product(db_session)

    response = await client.post(
        f"/v1/products/{product.slug}/reviews",
        json={"rating": 5, "comment": "Отлично"},
        headers=_headers(user),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "REVIEW_NOT_ELIGIBLE"


@pytest.mark.asyncio
async def test_eligible_user_can_create_review_pending_by_default(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    product, variant = await _make_product(db_session)
    await _make_delivered_order(db_session, user=user, product=product, variant=variant)

    response = await client.post(
        f"/v1/products/{product.slug}/reviews",
        json={"rating": 4, "comment": "Хороший товар"},
        headers=_headers(user),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["author_label"] == "Айгерим К."

    # Pending reviews don't show up in the public list yet.
    public_list = await client.get(f"/v1/products/{product.slug}/reviews")
    assert public_list.json()["total"] == 0


@pytest.mark.asyncio
async def test_cannot_review_same_product_twice(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    product, variant = await _make_product(db_session)
    await _make_delivered_order(db_session, user=user, product=product, variant=variant)
    headers = _headers(user)

    first = await client.post(
        f"/v1/products/{product.slug}/reviews", json={"rating": 5}, headers=headers
    )
    second = await client.post(
        f"/v1/products/{product.slug}/reviews", json={"rating": 3}, headers=headers
    )

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "REVIEW_ALREADY_EXISTS"


@pytest.mark.asyncio
async def test_my_review_endpoint_reports_eligibility(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    product, variant = await _make_product(db_session)
    headers = _headers(user)

    before = await client.get(f"/v1/products/{product.slug}/reviews/me", headers=headers)
    assert before.json() == {"eligible": False, "review": None}

    await _make_delivered_order(db_session, user=user, product=product, variant=variant)

    after = await client.get(f"/v1/products/{product.slug}/reviews/me", headers=headers)
    body = after.json()
    assert body["eligible"] is True
    assert body["review"] is None


@pytest.mark.asyncio
async def test_editing_review_resets_it_to_pending_moderation(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    manager = await _make_user(db_session, role="manager")
    product, variant = await _make_product(db_session)
    await _make_delivered_order(db_session, user=user, product=product, variant=variant)
    headers = _headers(user)

    created = await client.post(
        f"/v1/products/{product.slug}/reviews", json={"rating": 5}, headers=headers
    )
    review_id = created.json()["id"]
    await client.post(
        f"/v1/admin/reviews/{review_id}/moderate",
        json={"status": "approved"},
        headers=_headers(manager),
    )
    assert (await client.get(f"/v1/products/{product.slug}/reviews")).json()["total"] == 1

    updated = await client.patch(
        f"/v1/products/{product.slug}/reviews/me",
        json={"rating": 2, "comment": "Передумал"},
        headers=headers,
    )

    assert updated.status_code == 200
    assert updated.json()["status"] == "pending"
    assert (await client.get(f"/v1/products/{product.slug}/reviews")).json()["total"] == 0


@pytest.mark.asyncio
async def test_delete_my_review(client: httpx.AsyncClient, db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    product, variant = await _make_product(db_session)
    await _make_delivered_order(db_session, user=user, product=product, variant=variant)
    headers = _headers(user)

    await client.post(f"/v1/products/{product.slug}/reviews", json={"rating": 5}, headers=headers)
    delete_response = await client.delete(
        f"/v1/products/{product.slug}/reviews/me", headers=headers
    )
    assert delete_response.status_code == 204

    my_review = await client.get(f"/v1/products/{product.slug}/reviews/me", headers=headers)
    assert my_review.json()["review"] is None


@pytest.mark.asyncio
async def test_admin_moderation_approve_and_reject(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    manager = await _make_user(db_session, role="manager")
    product, variant = await _make_product(db_session)
    await _make_delivered_order(db_session, user=user, product=product, variant=variant)

    created = await client.post(
        f"/v1/products/{product.slug}/reviews", json={"rating": 5}, headers=_headers(user)
    )
    review_id = created.json()["id"]

    pending_list = await client.get(
        "/v1/admin/reviews", params={"status": "pending"}, headers=_headers(manager)
    )
    assert pending_list.status_code == 200
    assert any(item["id"] == review_id for item in pending_list.json()["items"])

    moderate = await client.post(
        f"/v1/admin/reviews/{review_id}/moderate",
        json={"status": "approved"},
        headers=_headers(manager),
    )
    assert moderate.status_code == 200
    assert moderate.json()["status"] == "approved"

    public_list = await client.get(f"/v1/products/{product.slug}/reviews")
    assert public_list.json()["total"] == 1


@pytest.mark.asyncio
async def test_customer_cannot_access_moderation(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)

    response = await client.get("/v1/admin/reviews", headers=_headers(user))

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_deleted_variant_does_not_break_eligibility(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    """product_id is denormalized onto OrderItem precisely so eligibility
    survives the variant being deleted later -- see
    app/reviews/service.py::check_eligibility.
    """
    user = await _make_user(db_session)
    product, variant = await _make_product(db_session)
    await _make_delivered_order(db_session, user=user, product=product, variant=variant)

    await db_session.delete(variant)
    await db_session.commit()

    response = await client.post(
        f"/v1/products/{product.slug}/reviews", json={"rating": 5}, headers=_headers(user)
    )

    assert response.status_code == 201
