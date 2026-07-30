import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import Category
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
