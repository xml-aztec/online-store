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
async def test_eligible_review_is_marked_verified_purchase(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    # ТЗ 5.7: "Проверенная покупка" badge -- true whenever the review is
    # backed by a delivered order for this product (see reviews/models.py::
    # Review.order_id, set at creation from reviews/service.py::
    # find_eligible_order_id).
    user = await _make_user(db_session)
    product, variant = await _make_product(db_session)
    await _make_delivered_order(db_session, user=user, product=product, variant=variant)

    response = await client.post(
        f"/v1/products/{product.slug}/reviews", json={"rating": 5}, headers=_headers(user)
    )

    assert response.status_code == 201
    assert response.json()["is_verified_purchase"] is True


@pytest.mark.asyncio
async def test_rating_avg_and_count_reflect_only_approved_reviews(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    # ТЗ 5.7: rating_avg/rating_count must reflect approved reviews only, and
    # must update correctly as moderation decisions come in -- not just "some
    # number changed" but the actual, correct average across 2-3 differently
    # rated reviews (regression coverage for R.1: verified the aggregation
    # itself, in app/catalog/service.py, already does this live/query-time
    # rather than via a stale cached column -- this test proves the
    # observable behavior end-to-end through moderation).
    manager = await _make_user(db_session, role="manager")
    product, variant = await _make_product(db_session)

    async def _reviewer_with_rating(rating: int) -> str:
        reviewer = await _make_user(db_session)
        await _make_delivered_order(db_session, user=reviewer, product=product, variant=variant)
        created = await client.post(
            f"/v1/products/{product.slug}/reviews",
            json={"rating": rating},
            headers=_headers(reviewer),
        )
        review_id: str = created.json()["id"]
        return review_id

    review_5 = await _reviewer_with_rating(5)
    review_3 = await _reviewer_with_rating(3)
    review_1 = await _reviewer_with_rating(1)

    # Before any moderation: no approved reviews yet, product shows no rating.
    detail = await client.get(f"/v1/products/{product.slug}")
    assert detail.json()["rating_avg"] is None
    assert detail.json()["rating_count"] == 0

    await client.post(
        f"/v1/admin/reviews/{review_5}/moderate",
        json={"status": "approved"},
        headers=_headers(manager),
    )
    await client.post(
        f"/v1/admin/reviews/{review_3}/moderate",
        json={"status": "approved"},
        headers=_headers(manager),
    )
    await client.post(
        f"/v1/admin/reviews/{review_1}/moderate",
        json={"status": "rejected"},
        headers=_headers(manager),
    )

    after_first_two = await client.get(f"/v1/products/{product.slug}")
    assert after_first_two.json()["rating_avg"] == 4.0  # avg(5, 3)
    assert after_first_two.json()["rating_count"] == 2  # rejected one excluded

    # Approving the third (lower-rated) review must correctly shift the
    # average down, not just bump the count.
    await client.post(
        f"/v1/admin/reviews/{review_1}/moderate",
        json={"status": "approved"},
        headers=_headers(manager),
    )

    after_all_three = await client.get(f"/v1/products/{product.slug}")
    assert after_all_three.json()["rating_avg"] == 3.0  # avg(5, 3, 1)
    assert after_all_three.json()["rating_count"] == 3


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
