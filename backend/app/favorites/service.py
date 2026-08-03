import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog import service as catalog_service
from app.catalog.schemas import ProductListItem
from app.exceptions import DomainError
from app.favorites.models import Favorite


async def list_favorite_product_ids(
    session: AsyncSession, *, user_id: uuid.UUID
) -> list[uuid.UUID]:
    rows = await session.scalars(
        select(Favorite.product_id)
        .where(Favorite.user_id == user_id)
        .order_by(Favorite.created_at.desc())
    )
    return list(rows.all())


async def list_favorites(
    session: AsyncSession, *, user_id: uuid.UUID, page: int, page_size: int
) -> tuple[list[ProductListItem], int]:
    total = (
        await session.scalar(
            select(func.count()).select_from(Favorite).where(Favorite.user_id == user_id)
        )
    ) or 0

    ordered_ids = (
        await session.scalars(
            select(Favorite.product_id)
            .where(Favorite.user_id == user_id)
            .order_by(Favorite.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    if not ordered_ids:
        return [], total

    items_by_id = await catalog_service.hydrate_product_list_items(session, list(ordered_ids))
    # Preserve favorited-at order and silently drop ids that no longer resolve
    # to an active product (deactivated/deleted since being favorited) --
    # matches how deleted products already disappear from search results.
    items = [items_by_id[product_id] for product_id in ordered_ids if product_id in items_by_id]
    return items, total


async def add_favorite(session: AsyncSession, *, user_id: uuid.UUID, product_id: uuid.UUID) -> None:
    existing = await session.scalar(
        select(Favorite).where(Favorite.user_id == user_id, Favorite.product_id == product_id)
    )
    if existing is not None:
        return

    session.add(Favorite(user_id=user_id, product_id=product_id))
    await session.commit()


async def remove_favorite(
    session: AsyncSession, *, user_id: uuid.UUID, product_id: uuid.UUID
) -> None:
    favorite = await session.scalar(
        select(Favorite).where(Favorite.user_id == user_id, Favorite.product_id == product_id)
    )
    if favorite is None:
        raise DomainError("Товар не в избранном", code="FAVORITE_NOT_FOUND", status_code=404)

    await session.delete(favorite)
    await session.commit()
