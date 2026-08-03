import time
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import Category, Product, ProductImage, ProductVariant
from app.config import settings
from app.core.storage import ensure_bucket_exists, get_s3_client
from app.orders.models import Order, OrderItem
from tests.factories import CategoryFactory, ProductFactory, ProductVariantFactory
from tests.helpers import s3_public_url_reachable, s3_reachable


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


async def _seed_catalog(session: AsyncSession) -> dict[str, Any]:
    # `root` wraps everything below so tests can scope queries to just this test's
    # own data via category=root.slug -- the shared dev DB may have unrelated rows
    # (e.g. from `make seed`) that would otherwise leak into unfiltered assertions.
    root = Category(name="Тестовый корень", slug=_slug("root"))
    session.add(root)
    await session.flush()
    parent = Category(name="Родитель", slug=_slug("parent"), parent_id=root.id)
    other = Category(name="Другая категория", slug=_slug("other"), parent_id=root.id)
    session.add_all([parent, other])
    await session.flush()
    child = Category(name="Ребёнок", slug=_slug("child"), parent_id=parent.id)
    session.add(child)
    await session.flush()

    base_time = datetime(2024, 1, 1, tzinfo=UTC)

    container = Product(
        category_id=child.id,
        name="Контейнер пищевой",
        slug=_slug("container"),
        description="Пластиковый контейнер для еды",
        created_at=base_time,
    )
    lunchbox = Product(
        category_id=child.id,
        name="Ланч-бокс",
        slug=_slug("lunchbox"),
        description="Ланч-бокс для еды",
        created_at=base_time + timedelta(days=1),
    )
    bath = Product(
        category_id=other.id,
        name="Ванночка детская",
        slug=_slug("bath"),
        description="Ванночка для купания",
        created_at=base_time + timedelta(days=2),
    )
    session.add_all([container, lunchbox, bath])
    await session.flush()

    container_black = ProductVariant(
        product_id=container.id,
        sku=_slug("sku"),
        price=Decimal("200.00"),
        stock_qty=10,
        options={"color": "черный", "volume": "1л"},
    )
    container_white_oos = ProductVariant(
        product_id=container.id,
        sku=_slug("sku"),
        price=Decimal("350.00"),
        stock_qty=0,
        options={"color": "белый", "volume": "1.5л"},
    )
    lunchbox_blue = ProductVariant(
        product_id=lunchbox.id,
        sku=_slug("sku"),
        price=Decimal("500.00"),
        stock_qty=5,
        options={"color": "синий"},
    )
    bath_pink = ProductVariant(
        product_id=bath.id,
        sku=_slug("sku"),
        price=Decimal("900.00"),
        stock_qty=3,
        options={"color": "розовый"},
    )
    session.add_all([container_black, container_white_oos, lunchbox_blue, bath_pink])
    await session.commit()

    return {
        "root": root,
        "parent": parent,
        "child": child,
        "other": other,
        "container": container,
        "lunchbox": lunchbox,
        "bath": bath,
        "container_black": container_black,
        "container_white_oos": container_white_oos,
        "lunchbox_blue": lunchbox_blue,
        "bath_pink": bath_pink,
    }


def _slugs(items: list[dict[str, Any]]) -> set[str]:
    return {item["slug"] for item in items}


@pytest.mark.asyncio
async def test_category_filter_includes_subcategory_products(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await _seed_catalog(db_session)

    response = await client.get("/v1/products", params={"category": data["parent"].slug})

    assert response.status_code == 200
    slugs = _slugs(response.json()["items"])
    assert slugs == {data["container"].slug, data["lunchbox"].slug}


@pytest.mark.asyncio
async def test_category_filter_direct_category(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await _seed_catalog(db_session)

    response = await client.get("/v1/products", params={"category": data["other"].slug})

    assert _slugs(response.json()["items"]) == {data["bath"].slug}


@pytest.mark.asyncio
async def test_unknown_category_filter_returns_empty(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _seed_catalog(db_session)

    response = await client.get("/v1/products", params={"category": "does-not-exist"})

    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_price_min_filter(client: AsyncClient, db_session: AsyncSession) -> None:
    data = await _seed_catalog(db_session)

    response = await client.get(
        "/v1/products", params={"category": data["root"].slug, "price_min": "400"}
    )

    assert _slugs(response.json()["items"]) == {data["lunchbox"].slug, data["bath"].slug}


@pytest.mark.asyncio
async def test_price_max_filter(client: AsyncClient, db_session: AsyncSession) -> None:
    data = await _seed_catalog(db_session)

    response = await client.get(
        "/v1/products", params={"category": data["root"].slug, "price_max": "300"}
    )

    items = response.json()["items"]
    assert _slugs(items) == {data["container"].slug}
    assert Decimal(items[0]["price_from"]) == Decimal("200.00")


@pytest.mark.asyncio
async def test_options_filter_color(client: AsyncClient, db_session: AsyncSession) -> None:
    data = await _seed_catalog(db_session)
    root_param = {"category": data["root"].slug}

    black = await client.get(
        "/v1/products", params={**root_param, "options[color]": "черный"}
    )
    blue = await client.get("/v1/products", params={**root_param, "options[color]": "синий"})

    assert _slugs(black.json()["items"]) == {data["container"].slug}
    assert _slugs(blue.json()["items"]) == {data["lunchbox"].slug}


@pytest.mark.asyncio
async def test_options_filter_volume(client: AsyncClient, db_session: AsyncSession) -> None:
    data = await _seed_catalog(db_session)

    response = await client.get(
        "/v1/products", params={"category": data["root"].slug, "options[volume]": "1л"}
    )

    assert _slugs(response.json()["items"]) == {data["container"].slug}


@pytest.mark.asyncio
async def test_search_matches_exact_word(client: AsyncClient, db_session: AsyncSession) -> None:
    data = await _seed_catalog(db_session)

    response = await client.get(
        "/v1/products", params={"category": data["root"].slug, "q": "контейнер"}
    )

    assert _slugs(response.json()["items"]) == {data["container"].slug}


@pytest.mark.asyncio
async def test_search_tolerates_typo_via_trigram_fallback(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await _seed_catalog(db_session)

    response = await client.get(
        "/v1/products", params={"category": data["root"].slug, "q": "кантейнер"}
    )

    assert _slugs(response.json()["items"]) == {data["container"].slug}


@pytest.mark.asyncio
async def test_combination_category_and_search(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await _seed_catalog(db_session)

    response = await client.get(
        "/v1/products", params={"category": data["parent"].slug, "q": "ланч"}
    )

    assert _slugs(response.json()["items"]) == {data["lunchbox"].slug}


@pytest.mark.asyncio
async def test_combination_price_and_options(client: AsyncClient, db_session: AsyncSession) -> None:
    data = await _seed_catalog(db_session)

    response = await client.get(
        "/v1/products",
        params={"category": data["root"].slug, "price_max": "600", "options[color]": "синий"},
    )

    assert _slugs(response.json()["items"]) == {data["lunchbox"].slug}


@pytest.mark.asyncio
async def test_sort_price_asc_and_desc(client: AsyncClient, db_session: AsyncSession) -> None:
    data = await _seed_catalog(db_session)
    root_param = {"category": data["root"].slug}

    asc = await client.get("/v1/products", params={**root_param, "sort": "price_asc"})
    desc = await client.get("/v1/products", params={**root_param, "sort": "price_desc"})

    expected_asc = [data["container"].slug, data["lunchbox"].slug, data["bath"].slug]
    assert [item["slug"] for item in asc.json()["items"]] == expected_asc
    assert [item["slug"] for item in desc.json()["items"]] == list(reversed(expected_asc))


@pytest.mark.asyncio
async def test_sort_newest(client: AsyncClient, db_session: AsyncSession) -> None:
    data = await _seed_catalog(db_session)

    response = await client.get(
        "/v1/products", params={"category": data["root"].slug, "sort": "newest"}
    )

    expected = [data["bath"].slug, data["lunchbox"].slug, data["container"].slug]
    assert [item["slug"] for item in response.json()["items"]] == expected


@pytest.mark.asyncio
async def test_sort_popular_uses_real_order_data(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await _seed_catalog(db_session)

    order = Order(
        number=_slug("ORD"),
        email="popularity-test@example.com",
        phone="+996700000000",
        full_name="Тест",
        payment_method="cash_on_delivery",
        delivery_method="pickup",
        subtotal=Decimal("50000.00"),
        total=Decimal("50000.00"),
    )
    db_session.add(order)
    await db_session.flush()
    db_session.add(
        OrderItem(
            order_id=order.id,
            variant_id=data["lunchbox_blue"].id,
            product_name=data["lunchbox"].name,
            sku=data["lunchbox_blue"].sku,
            unit_price=Decimal("500.00"),
            quantity=100,
            line_total=Decimal("50000.00"),
        )
    )
    await db_session.commit()

    response = await client.get(
        "/v1/products", params={"category": data["root"].slug, "sort": "popular"}
    )

    expected = [data["lunchbox"].slug, data["bath"].slug, data["container"].slug]
    assert [item["slug"] for item in response.json()["items"]] == expected


@pytest.mark.asyncio
async def test_is_available_reflects_variant_stock(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await _seed_catalog(db_session)

    response = await client.get("/v1/products", params={"category": data["parent"].slug})

    by_slug = {item["slug"]: item for item in response.json()["items"]}
    assert by_slug[data["container"].slug]["is_available"] is True


@pytest.mark.asyncio
async def test_facets_reflect_current_selection(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await _seed_catalog(db_session)
    root_param = {"category": data["root"].slug}

    unfiltered = await client.get("/v1/products", params=root_param)
    facets = unfiltered.json()["facets"]
    assert Decimal(facets["price_min"]) == Decimal("200.00")
    assert Decimal(facets["price_max"]) == Decimal("900.00")
    assert set(facets["options"]["color"]) == {"белый", "розовый", "синий", "черный"}
    assert set(facets["options"]["volume"]) == {"1л", "1.5л"}

    filtered = await client.get("/v1/products", params={**root_param, "price_max": "300"})
    filtered_facets = filtered.json()["facets"]
    assert Decimal(filtered_facets["price_min"]) == Decimal("200.00")
    assert Decimal(filtered_facets["price_max"]) == Decimal("200.00")
    assert filtered_facets["options"] == {"color": ["черный"], "volume": ["1л"]}


@pytest.mark.asyncio
async def test_pagination(client: AsyncClient, db_session: AsyncSession) -> None:
    data = await _seed_catalog(db_session)
    root_param = {"category": data["root"].slug}

    page_one = await client.get("/v1/products", params={**root_param, "page": 1, "page_size": 2})
    page_two = await client.get("/v1/products", params={**root_param, "page": 2, "page_size": 2})

    assert page_one.json()["total"] == 3
    assert len(page_one.json()["items"]) == 2
    assert len(page_two.json()["items"]) == 1


@pytest.mark.asyncio
async def test_pagination_rejects_invalid_params(client: AsyncClient) -> None:
    assert (await client.get("/v1/products", params={"page": 0})).status_code == 422
    assert (await client.get("/v1/products", params={"page_size": 101})).status_code == 422


@pytest.mark.asyncio
async def test_product_detail_by_slug(client: AsyncClient, db_session: AsyncSession) -> None:
    data = await _seed_catalog(db_session)

    response = await client.get(f"/v1/products/{data['container'].slug}")

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Контейнер пищевой"
    assert body["category"]["slug"] == data["child"].slug
    variant_skus = {variant["sku"] for variant in body["variants"]}
    assert variant_skus == {data["container_black"].sku, data["container_white_oos"].sku}


@pytest.mark.asyncio
async def test_product_detail_not_found(client: AsyncClient) -> None:
    response = await client.get("/v1/products/does-not-exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PRODUCT_NOT_FOUND"


@pytest.mark.asyncio
@pytest.mark.skipif(
    not (s3_reachable() and s3_public_url_reachable()),
    reason="S3/MinIO endpoint or its public URL host is not reachable in this environment",
)
async def test_product_detail_includes_working_presigned_image_url(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await _seed_catalog(db_session)
    ensure_bucket_exists()
    s3_key = f"products/{uuid.uuid4().hex}.webp"
    get_s3_client().put_object(Bucket=settings.s3_bucket, Key=s3_key, Body=b"fake-image-bytes")
    db_session.add(ProductImage(product_id=data["container"].id, s3_key=s3_key, sort_order=0))
    await db_session.commit()

    response = await client.get(f"/v1/products/{data['container'].slug}")

    image_url = response.json()["images"][0]["url"]
    image_response = httpx.get(image_url)
    assert image_response.status_code == 200
    assert image_response.content == b"fake-image-bytes"


@pytest.mark.asyncio
async def test_list_item_image_urls_ordered_and_capped(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # generate_presigned_url() is a pure local signing computation (no network
    # call), so unlike the round-trip test above this doesn't need real
    # S3/MinIO reachability -- just enough images to exercise ordering + cap.
    data = await _seed_catalog(db_session)
    product = data["container"]
    for index in range(8):
        db_session.add(
            ProductImage(
                product_id=product.id,
                s3_key=f"products/{product.id}/{index}.webp",
                sort_order=index,
            )
        )
    await db_session.commit()

    response = await client.get("/v1/products", params={"category": data["root"].slug})
    item = _item_by_slug(response.json()["items"], product.slug)

    assert len(item["image_urls"]) == 6  # _CARD_IMAGE_LIMIT
    assert item["image_url"] == item["image_urls"][0]
    # Ordering follows sort_order -- the URLs embed the key, so index 0..5 (not
    # e.g. a shuffled or last-6 subset) is what should show up.
    for index, url in enumerate(item["image_urls"]):
        assert f"/{index}.webp" in url


@pytest.mark.asyncio
async def test_products_list_p95_latency_under_100ms(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    category = CategoryFactory.build()
    db_session.add(category)
    await db_session.flush()

    for _ in range(30):
        product = ProductFactory.build(category_id=category.id)
        db_session.add(product)
        await db_session.flush()
        db_session.add(ProductVariantFactory.build(product_id=product.id))
    await db_session.commit()

    durations: list[float] = []
    for _ in range(20):
        start = time.perf_counter()
        response = await client.get("/v1/products", params={"page_size": 24})
        durations.append(time.perf_counter() - start)
        assert response.status_code == 200

    durations.sort()
    p95 = durations[min(int(len(durations) * 0.95), len(durations) - 1)]
    assert p95 < 0.1, f"p95 latency {p95 * 1000:.1f}ms exceeds 100ms"


def _item_by_slug(items: list[dict[str, Any]], slug: str) -> dict[str, Any]:
    return next(item for item in items if item["slug"] == slug)


@pytest.mark.asyncio
async def test_discount_percent_and_stock_qty_on_list_item(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data = await _seed_catalog(db_session)
    # container_black has no compare_at_price (not on sale); give the other
    # variant one so the product-level aggregate has something to report.
    data["container_white_oos"].compare_at_price = Decimal("400.00")  # 350 vs 400 -> 13%
    await db_session.commit()

    response = await client.get("/v1/products", params={"category": data["root"].slug})
    items = response.json()["items"]

    container = _item_by_slug(items, data["container"].slug)
    assert container["discount_percent"] == 13
    assert Decimal(container["compare_at_price"]) == Decimal("400.00")
    assert container["stock_qty"] == 10  # 10 (black) + 0 (white, out of stock)

    lunchbox = _item_by_slug(items, data["lunchbox"].slug)
    assert lunchbox["discount_percent"] is None
    assert lunchbox["stock_qty"] == 5


@pytest.mark.asyncio
async def test_on_sale_filter(client: AsyncClient, db_session: AsyncSession) -> None:
    data = await _seed_catalog(db_session)
    data["lunchbox_blue"].compare_at_price = Decimal("600.00")
    await db_session.commit()

    response = await client.get(
        "/v1/products", params={"category": data["root"].slug, "on_sale": "true"}
    )

    assert _slugs(response.json()["items"]) == {data["lunchbox"].slug}


@pytest.mark.asyncio
async def test_in_stock_filter(client: AsyncClient, db_session: AsyncSession) -> None:
    data = await _seed_catalog(db_session)
    # container has an in-stock variant (black) alongside its out-of-stock one
    # (white), so it stays available under in_stock=true; a product whose
    # *only* variant is out of stock should not.
    only_variant = data["lunchbox_blue"]
    only_variant.stock_qty = 0
    await db_session.commit()

    response = await client.get(
        "/v1/products", params={"category": data["root"].slug, "in_stock": "true"}
    )

    slugs = _slugs(response.json()["items"])
    assert data["container"].slug in slugs
    assert data["lunchbox"].slug not in slugs


@pytest.mark.asyncio
async def test_rating_reflects_only_approved_reviews(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from app.auth.models import User
    from app.reviews.models import Review

    data = await _seed_catalog(db_session)
    user_a = User(email=f"{_slug('a')}@example.com", full_name="Покупатель А")
    user_b = User(email=f"{_slug('b')}@example.com", full_name="Покупатель Б")
    user_c = User(email=f"{_slug('c')}@example.com", full_name="Покупатель В")
    db_session.add_all([user_a, user_b, user_c])
    await db_session.flush()

    db_session.add_all(
        [
            Review(
                product_id=data["container"].id, user_id=user_a.id, rating=5, status="approved"
            ),
            Review(
                product_id=data["container"].id, user_id=user_b.id, rating=3, status="approved"
            ),
            # Pending review shouldn't move the average or count.
            Review(
                product_id=data["container"].id, user_id=user_c.id, rating=1, status="pending"
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/v1/products", params={"category": data["root"].slug})
    container = _item_by_slug(response.json()["items"], data["container"].slug)

    assert container["rating_avg"] == 4.0
    assert container["rating_count"] == 2

    detail_response = await client.get(f"/v1/products/{data['container'].slug}")
    detail = detail_response.json()
    assert detail["rating_avg"] == 4.0
    assert detail["rating_count"] == 2
