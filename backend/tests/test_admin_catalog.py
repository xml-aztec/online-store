import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.catalog.models import Category, Product, ProductVariant
from app.core.security import create_access_token


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


async def _make_user(session: AsyncSession, *, role: str) -> User:
    user = User(email=f"{role}-{uuid.uuid4().hex[:10]}@example.com", role=role)
    session.add(user)
    await session.flush()
    return user


async def _admin_headers(session: AsyncSession) -> dict[str, str]:
    user = await _make_user(session, role="admin")
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


async def _make_category(session: AsyncSession, **overrides: object) -> Category:
    category = Category(name="Категория", slug=_slug("cat"), **overrides)
    session.add(category)
    await session.flush()
    return category


async def _make_product(session: AsyncSession, category: Category, **overrides: object) -> Product:
    product = Product(category_id=category.id, name="Товар", slug=_slug("product"), **overrides)
    session.add(product)
    await session.flush()
    return product


async def _make_variant(
    session: AsyncSession, product: Product, **overrides: object
) -> ProductVariant:
    defaults: dict[str, object] = {"price": Decimal("100.00"), "stock_qty": 5}
    defaults.update(overrides)
    variant = ProductVariant(product_id=product.id, sku=_slug("sku"), **defaults)
    session.add(variant)
    await session.flush()
    return variant


@pytest.mark.asyncio
async def test_admin_endpoints_require_admin_role(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    no_auth = await client.post("/v1/admin/categories", json={"name": "X", "slug": _slug("x")})
    assert no_auth.status_code == 401

    customer = await _make_user(db_session, role="customer")
    customer_headers = {
        "Authorization": f"Bearer {create_access_token(customer.id, customer.role)}"
    }
    forbidden = await client.post(
        "/v1/admin/categories", json={"name": "X", "slug": _slug("x")}, headers=customer_headers
    )
    assert forbidden.status_code == 403

    manager = await _make_user(db_session, role="manager")
    manager_headers = {"Authorization": f"Bearer {create_access_token(manager.id, manager.role)}"}
    also_forbidden = await client.post(
        "/v1/admin/categories", json={"name": "X", "slug": _slug("x")}, headers=manager_headers
    )
    assert also_forbidden.status_code == 403

    admin_headers = await _admin_headers(db_session)
    allowed = await client.post(
        "/v1/admin/categories", json={"name": "X", "slug": _slug("x")}, headers=admin_headers
    )
    assert allowed.status_code == 201


@pytest.mark.asyncio
async def test_category_crud(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(db_session)
    slug = _slug("cat")

    create_response = await client.post(
        "/v1/admin/categories",
        json={"name": "Новая категория", "slug": slug, "sort_order": 5},
        headers=headers,
    )
    assert create_response.status_code == 201
    category_id = create_response.json()["id"]

    get_response = await client.get(f"/v1/admin/categories/{category_id}", headers=headers)
    assert get_response.status_code == 200
    assert get_response.json()["slug"] == slug

    update_response = await client.patch(
        f"/v1/admin/categories/{category_id}", json={"name": "Обновлено"}, headers=headers
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Обновлено"

    delete_response = await client.delete(f"/v1/admin/categories/{category_id}", headers=headers)
    assert delete_response.status_code == 204

    not_found = await client.get(f"/v1/admin/categories/{category_id}", headers=headers)
    assert not_found.status_code == 404


@pytest.mark.asyncio
async def test_cannot_deactivate_category_with_active_products(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    category = await _make_category(db_session)
    await _make_product(db_session, category)
    await db_session.commit()

    response = await client.patch(
        f"/v1/admin/categories/{category.id}", json={"is_active": False}, headers=headers
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CATEGORY_HAS_ACTIVE_PRODUCTS"


@pytest.mark.asyncio
async def test_can_deactivate_category_without_active_products(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    category = await _make_category(db_session)
    await _make_product(db_session, category, is_active=False)
    await db_session.commit()

    response = await client.patch(
        f"/v1/admin/categories/{category.id}", json={"is_active": False}, headers=headers
    )

    assert response.status_code == 200
    assert response.json()["is_active"] is False


@pytest.mark.asyncio
async def test_cannot_delete_category_with_products(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    category = await _make_category(db_session)
    await _make_product(db_session, category)
    await db_session.commit()

    response = await client.delete(f"/v1/admin/categories/{category.id}", headers=headers)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CATEGORY_HAS_PRODUCTS"


@pytest.mark.asyncio
async def test_cannot_delete_category_with_children(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    parent = await _make_category(db_session)
    await _make_category(db_session, parent_id=parent.id)
    await db_session.commit()

    response = await client.delete(f"/v1/admin/categories/{parent.id}", headers=headers)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CATEGORY_HAS_CHILDREN"


@pytest.mark.asyncio
async def test_product_crud_and_soft_delete(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(db_session)
    category = await _make_category(db_session)
    await db_session.commit()
    slug = _slug("product")

    create_response = await client.post(
        "/v1/admin/products",
        json={"category_id": str(category.id), "name": "Товар", "slug": slug},
        headers=headers,
    )
    assert create_response.status_code == 201
    product_id = create_response.json()["id"]
    assert create_response.json()["variants"] == []
    assert create_response.json()["images"] == []

    update_response = await client.patch(
        f"/v1/admin/products/{product_id}", json={"name": "Обновлённый товар"}, headers=headers
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Обновлённый товар"

    delete_response = await client.delete(f"/v1/admin/products/{product_id}", headers=headers)
    assert delete_response.status_code == 204

    not_found = await client.get(f"/v1/admin/products/{product_id}", headers=headers)
    assert not_found.status_code == 404


@pytest.mark.asyncio
async def test_duplicate_product_copies_variants_as_draft(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    category = await _make_category(db_session)
    product = await _make_product(db_session, category, is_active=True)
    await _make_variant(db_session, product, price=Decimal("250.00"), stock_qty=20)
    await db_session.commit()

    response = await client.post(f"/v1/admin/products/{product.id}/duplicate", headers=headers)

    assert response.status_code == 201
    body = response.json()
    assert body["id"] != str(product.id)
    assert body["slug"] != product.slug
    assert body["is_active"] is False
    assert len(body["variants"]) == 1
    assert body["variants"][0]["stock_qty"] == 0
    assert Decimal(body["variants"][0]["price"]) == Decimal("250.00")


@pytest.mark.asyncio
async def test_bulk_status_toggle(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(db_session)
    category = await _make_category(db_session)
    product_a = await _make_product(db_session, category, is_active=True)
    product_b = await _make_product(db_session, category, is_active=True)
    await db_session.commit()

    response = await client.post(
        "/v1/admin/products/bulk-status",
        json={"product_ids": [str(product_a.id), str(product_b.id)], "is_active": False},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["updated"] == 2

    check = await client.get(f"/v1/admin/products/{product_a.id}", headers=headers)
    assert check.json()["is_active"] is False


@pytest.mark.asyncio
async def test_variant_crud(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(db_session)
    category = await _make_category(db_session)
    product = await _make_product(db_session, category)
    await db_session.commit()

    create_response = await client.post(
        f"/v1/admin/products/{product.id}/variants",
        json={"sku": _slug("sku"), "price": "199.00", "stock_qty": 10, "options": {"color": "red"}},
        headers=headers,
    )
    assert create_response.status_code == 201
    variant_id = create_response.json()["id"]

    update_response = await client.patch(
        f"/v1/admin/products/{product.id}/variants/{variant_id}",
        json={"price": "249.00"},
        headers=headers,
    )
    assert update_response.status_code == 200
    assert Decimal(update_response.json()["price"]) == Decimal("249.00")
    # Deleting the sole remaining variant is covered separately by
    # test_cannot_delete_last_variant / test_can_delete_variant_when_others_remain.


@pytest.mark.asyncio
async def test_cannot_delete_last_variant(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(db_session)
    category = await _make_category(db_session)
    product = await _make_product(db_session, category)
    variant = await _make_variant(db_session, product)
    await db_session.commit()

    response = await client.delete(
        f"/v1/admin/products/{product.id}/variants/{variant.id}", headers=headers
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "LAST_VARIANT"


@pytest.mark.asyncio
async def test_can_delete_variant_when_others_remain(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    category = await _make_category(db_session)
    product = await _make_product(db_session, category)
    variant_one = await _make_variant(db_session, product, options={"color": "red"})
    await _make_variant(db_session, product, options={"color": "blue"})
    await db_session.commit()

    response = await client.delete(
        f"/v1/admin/products/{product.id}/variants/{variant_one.id}", headers=headers
    )

    assert response.status_code == 204
