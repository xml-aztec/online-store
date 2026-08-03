import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.catalog.models import Product
from app.exceptions import DomainError
from app.orders.models import Order, OrderItem
from app.reviews.models import Review


def author_label(user: User) -> str:
    if user.full_name:
        parts = user.full_name.split()
        if len(parts) >= 2:
            return f"{parts[0]} {parts[1][0]}."
        return parts[0]
    return user.email.split("@")[0]


async def get_product_id_or_404(session: AsyncSession, *, slug: str) -> uuid.UUID:
    product_id = await session.scalar(
        select(Product.id).where(Product.slug == slug, Product.deleted_at.is_(None))
    )
    if product_id is None:
        raise DomainError("Товар не найден", code="PRODUCT_NOT_FOUND", status_code=404)
    return product_id


async def check_eligibility(
    session: AsyncSession, *, product_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    """A delivered order containing this product proves eligibility. Relies on
    OrderItem.product_id, denormalized at order-creation time specifically so
    this check survives a variant later being deleted -- see
    app/orders/models.py::OrderItem.product_id.
    """
    exists_stmt = (
        select(OrderItem.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.user_id == user_id,
            Order.status == "delivered",
            OrderItem.product_id == product_id,
        )
        .exists()
    )
    return bool(await session.scalar(select(exists_stmt)))


async def get_my_review(
    session: AsyncSession, *, product_id: uuid.UUID, user_id: uuid.UUID
) -> Review | None:
    review = await session.scalar(
        select(Review).where(Review.product_id == product_id, Review.user_id == user_id)
    )
    return review


async def _get_my_review_or_404(
    session: AsyncSession, *, product_id: uuid.UUID, user_id: uuid.UUID
) -> Review:
    review = await get_my_review(session, product_id=product_id, user_id=user_id)
    if review is None:
        raise DomainError("Отзыв не найден", code="REVIEW_NOT_FOUND", status_code=404)
    return review


async def create_review(
    session: AsyncSession,
    *,
    product_id: uuid.UUID,
    user_id: uuid.UUID,
    rating: int,
    comment: str | None,
) -> Review:
    if await get_my_review(session, product_id=product_id, user_id=user_id) is not None:
        raise DomainError("Отзыв уже оставлен", code="REVIEW_ALREADY_EXISTS", status_code=409)
    if not await check_eligibility(session, product_id=product_id, user_id=user_id):
        raise DomainError(
            "Оставить отзыв можно только после доставленного заказа с этим товаром",
            code="REVIEW_NOT_ELIGIBLE",
            status_code=403,
        )

    review = Review(
        product_id=product_id, user_id=user_id, rating=rating, comment=comment, status="pending"
    )
    session.add(review)
    await session.commit()
    return review


async def update_my_review(
    session: AsyncSession, *, product_id: uuid.UUID, user_id: uuid.UUID, updates: dict[str, Any]
) -> Review:
    review = await _get_my_review_or_404(session, product_id=product_id, user_id=user_id)
    for key, value in updates.items():
        setattr(review, key, value)
    # Editing sends it back to moderation -- an approved review whose text
    # changed shouldn't stay published without another look.
    review.status = "pending"
    await session.commit()
    return review


async def delete_my_review(
    session: AsyncSession, *, product_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    review = await _get_my_review_or_404(session, product_id=product_id, user_id=user_id)
    await session.delete(review)
    await session.commit()


async def list_reviews(
    session: AsyncSession, *, product_id: uuid.UUID, page: int, page_size: int
) -> tuple[list[tuple[Review, str]], int]:
    conditions = (Review.product_id == product_id, Review.status == "approved")

    total = (
        await session.scalar(select(func.count()).select_from(Review).where(*conditions))
    ) or 0

    rows = (
        await session.execute(
            select(Review, User)
            .join(User, User.id == Review.user_id)
            .where(*conditions)
            .order_by(Review.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    items = [(review, author_label(user)) for review, user in rows]
    return items, total


# --- Admin moderation ---


async def list_reviews_admin(
    session: AsyncSession, *, status_filter: str | None, page: int, page_size: int
) -> tuple[list[tuple[Review, str, str]], int]:
    conditions = [Review.status == status_filter] if status_filter else []

    total = (
        await session.scalar(select(func.count()).select_from(Review).where(*conditions))
    ) or 0

    rows = (
        await session.execute(
            select(Review, User, Product)
            .join(User, User.id == Review.user_id)
            .join(Product, Product.id == Review.product_id)
            .where(*conditions)
            .order_by(Review.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    items = [(review, author_label(user), product.name) for review, user, product in rows]
    return items, total


async def _get_review_or_404(session: AsyncSession, *, review_id: uuid.UUID) -> Review:
    review = await session.get(Review, review_id)
    if review is None:
        raise DomainError("Отзыв не найден", code="REVIEW_NOT_FOUND", status_code=404)
    return review


async def moderate_review(
    session: AsyncSession, *, review_id: uuid.UUID, status: str
) -> Review:
    review = await _get_review_or_404(session, review_id=review_id)
    review.status = status
    await session.commit()
    return review


async def get_review_context(
    session: AsyncSession, *, review_id: uuid.UUID
) -> tuple[Review, str, str]:
    """(review, author_label, product_name) for a single review id -- used to
    build the admin response after a create/moderate call already has the
    Review row but not its joined display fields."""
    row = (
        await session.execute(
            select(Review, User, Product)
            .join(User, User.id == Review.user_id)
            .join(Product, Product.id == Review.product_id)
            .where(Review.id == review_id)
        )
    ).one()
    review, user, product = row
    return review, author_label(user), product.name
