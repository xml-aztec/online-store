import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import Category, Product, ProductVariant
from app.catalog.service import get_category_tree, invalidate_category_cache
from app.core.redis import get_redis


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


@pytest.mark.asyncio
async def test_categories_endpoint_returns_nested_tree(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    parent = Category(name="Родитель", slug=_slug("parent"), sort_order=0)
    db_session.add(parent)
    await db_session.flush()
    child = Category(name="Ребёнок", slug=_slug("child"), parent_id=parent.id, sort_order=0)
    db_session.add(child)
    await db_session.commit()

    response = await client.get("/v1/categories")

    assert response.status_code == 200
    body = response.json()
    parent_node = next(node for node in body if node["slug"] == parent.slug)
    assert len(parent_node["children"]) == 1
    assert parent_node["children"][0]["slug"] == child.slug


@pytest.mark.asyncio
async def test_categories_endpoint_excludes_inactive(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    active = Category(name="Активная", slug=_slug("active"), is_active=True)
    inactive = Category(name="Неактивная", slug=_slug("inactive"), is_active=False)
    db_session.add_all([active, inactive])
    await db_session.commit()

    response = await client.get("/v1/categories")

    slugs = {node["slug"] for node in response.json()}
    assert active.slug in slugs
    assert inactive.slug not in slugs


@pytest.mark.asyncio
async def test_category_tree_is_cached_between_calls(db_session: AsyncSession) -> None:
    category = Category(name="Кэш-тест", slug=_slug("cache"))
    db_session.add(category)
    await db_session.commit()

    first = await get_category_tree(db_session)
    assert any(node.slug == category.slug for node in first)

    # A category added after the first (cached) read shouldn't appear yet.
    another = Category(name="После кэша", slug=_slug("after-cache"))
    db_session.add(another)
    await db_session.commit()

    cached = await get_category_tree(db_session)
    assert not any(node.slug == another.slug for node in cached)


@pytest.mark.asyncio
async def test_invalidate_category_cache_forces_refresh(db_session: AsyncSession) -> None:
    category = Category(name="До инвалидации", slug=_slug("before"))
    db_session.add(category)
    await db_session.commit()
    await get_category_tree(db_session)

    new_category = Category(name="После инвалидации", slug=_slug("after"))
    db_session.add(new_category)
    await db_session.commit()

    await invalidate_category_cache()
    redis = get_redis()
    assert await redis.get("catalog:categories:tree") is None

    refreshed = await get_category_tree(db_session)
    assert any(node.slug == new_category.slug for node in refreshed)


@pytest.mark.asyncio
async def test_category_tree_product_count_rolls_up_to_ancestors(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    root = Category(name="Дом", slug=_slug("root"))
    db_session.add(root)
    await db_session.flush()
    child = Category(name="Кухня", slug=_slug("child"), parent_id=root.id)
    db_session.add(child)
    await db_session.flush()

    product = Product(category_id=child.id, name="Товар", slug=_slug("product"))
    db_session.add(product)
    await db_session.flush()
    variant = ProductVariant(product_id=product.id, sku=_slug("sku"), price=100, stock_qty=5)
    db_session.add(variant)
    await db_session.commit()

    response = await client.get("/v1/categories")

    body = response.json()
    root_node = next(node for node in body if node["slug"] == root.slug)
    child_node = root_node["children"][0]
    assert child_node["slug"] == child.slug
    assert child_node["product_count"] == 1
    # A product's count rolls up through every ancestor, not just its own category.
    assert root_node["product_count"] == 1


@pytest.mark.asyncio
async def test_category_tree_product_count_excludes_inactive_products(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    category = Category(name="Категория", slug=_slug("cat"))
    db_session.add(category)
    await db_session.flush()

    active = Product(category_id=category.id, name="Активный", slug=_slug("active"))
    inactive = Product(
        category_id=category.id, name="Неактивный", slug=_slug("inactive"), is_active=False
    )
    db_session.add_all([active, inactive])
    await db_session.commit()

    response = await client.get("/v1/categories")

    node = next(n for n in response.json() if n["slug"] == category.slug)
    assert node["product_count"] == 1
