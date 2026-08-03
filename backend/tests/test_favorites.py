import uuid
from decimal import Decimal

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.catalog.models import Category, Product, ProductVariant
from app.core.security import create_access_token


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


async def _make_user(db_session: AsyncSession) -> User:
    user = User(email=f"{_slug('user')}@example.com", full_name="Покупатель")
    db_session.add(user)
    await db_session.commit()
    return user


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


async def _make_product(db_session: AsyncSession, *, is_active: bool = True) -> Product:
    category = Category(name="Категория", slug=_slug("cat"))
    db_session.add(category)
    await db_session.flush()
    product = Product(
        category_id=category.id, name="Товар", slug=_slug("product"), is_active=is_active
    )
    db_session.add(product)
    await db_session.flush()
    db_session.add(
        ProductVariant(
            product_id=product.id, sku=_slug("sku"), price=Decimal("100.00"), stock_qty=5
        )
    )
    await db_session.commit()
    return product


@pytest.mark.asyncio
async def test_add_list_remove_favorite_lifecycle(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _headers(user)
    product = await _make_product(db_session)

    add_response = await client.post(f"/v1/me/favorites/{product.id}", headers=headers)
    assert add_response.status_code == 204

    list_response = await client.get("/v1/me/favorites", headers=headers)
    assert list_response.status_code == 200
    body = list_response.json()
    assert body["total"] == 1
    assert body["items"][0]["slug"] == product.slug

    ids_response = await client.get("/v1/me/favorites/ids", headers=headers)
    assert ids_response.json() == [str(product.id)]

    remove_response = await client.delete(f"/v1/me/favorites/{product.id}", headers=headers)
    assert remove_response.status_code == 204

    empty_list = await client.get("/v1/me/favorites", headers=headers)
    assert empty_list.json()["total"] == 0


@pytest.mark.asyncio
async def test_adding_favorite_twice_is_idempotent(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _headers(user)
    product = await _make_product(db_session)

    first = await client.post(f"/v1/me/favorites/{product.id}", headers=headers)
    second = await client.post(f"/v1/me/favorites/{product.id}", headers=headers)
    assert first.status_code == 204
    assert second.status_code == 204

    list_response = await client.get("/v1/me/favorites", headers=headers)
    assert list_response.json()["total"] == 1


@pytest.mark.asyncio
async def test_removing_favorite_not_present_returns_404(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)

    response = await client.delete(f"/v1/me/favorites/{uuid.uuid4()}", headers=_headers(user))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "FAVORITE_NOT_FOUND"


@pytest.mark.asyncio
async def test_favorites_are_scoped_per_user(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _make_user(db_session)
    other = await _make_user(db_session)
    product = await _make_product(db_session)

    await client.post(f"/v1/me/favorites/{product.id}", headers=_headers(owner))

    other_list = await client.get("/v1/me/favorites", headers=_headers(other))
    assert other_list.json()["total"] == 0


@pytest.mark.asyncio
async def test_favorites_require_authentication(client: httpx.AsyncClient) -> None:
    response = await client.get("/v1/me/favorites")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_favorites_list_omits_deactivated_products(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _headers(user)
    product = await _make_product(db_session)
    await client.post(f"/v1/me/favorites/{product.id}", headers=headers)

    product.is_active = False
    await db_session.commit()

    list_response = await client.get("/v1/me/favorites", headers=headers)
    assert list_response.json()["items"] == []
    # The favorite row itself still exists -- only hydration drops it.
    ids_response = await client.get("/v1/me/favorites/ids", headers=headers)
    assert ids_response.json() == [str(product.id)]
