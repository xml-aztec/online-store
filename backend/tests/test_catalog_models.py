import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import Category, Product, ProductVariant


async def _make_category(session: AsyncSession) -> Category:
    category = Category(name="Контейнеры", slug=f"containers-{uuid.uuid4().hex[:8]}")
    session.add(category)
    await session.flush()
    return category


async def _make_product(session: AsyncSession, category: Category, **kwargs: object) -> Product:
    product = Product(
        category_id=category.id,
        name=kwargs.pop("name", "Контейнер пищевой 1л"),
        slug=f"product-{uuid.uuid4().hex[:8]}",
        **kwargs,
    )
    session.add(product)
    await session.flush()
    return product


@pytest.mark.asyncio
async def test_product_variant_price_check_constraint(db_session: AsyncSession) -> None:
    category = await _make_category(db_session)
    product = await _make_product(db_session, category)
    db_session.add(
        ProductVariant(
            product_id=product.id, sku=f"sku-{uuid.uuid4().hex[:8]}", price=Decimal("-1.00")
        )
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_product_variant_stock_qty_check_constraint(db_session: AsyncSession) -> None:
    category = await _make_category(db_session)
    product = await _make_product(db_session, category)
    db_session.add(
        ProductVariant(
            product_id=product.id,
            sku=f"sku-{uuid.uuid4().hex[:8]}",
            price=Decimal("100.00"),
            stock_qty=-1,
        )
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_product_variant_unique_product_and_options(db_session: AsyncSession) -> None:
    category = await _make_category(db_session)
    product = await _make_product(db_session, category)
    options = {"volume": "1l", "color": "black"}
    db_session.add(
        ProductVariant(
            product_id=product.id, sku=f"sku-{uuid.uuid4().hex[:8]}", price=Decimal("100.00"),
            options=options,
        )
    )
    await db_session.flush()

    db_session.add(
        ProductVariant(
            product_id=product.id, sku=f"sku-{uuid.uuid4().hex[:8]}", price=Decimal("110.00"),
            options=options,
        )
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_product_search_vector_is_generated_from_name_and_description(
    db_session: AsyncSession,
) -> None:
    category = await _make_category(db_session)
    product = await _make_product(
        db_session, category, name="Контейнер пищевой", description="Пластиковый, 1 литр"
    )

    refreshed = await db_session.scalar(select(Product).where(Product.id == product.id))
    assert refreshed is not None
    assert refreshed.search_vector is not None
    assert "контейнер" in refreshed.search_vector
