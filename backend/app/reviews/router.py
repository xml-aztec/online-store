from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db
from app.dependencies import get_current_user
from app.reviews import service as reviews_service
from app.reviews.models import Review
from app.reviews.schemas import (
    MyReviewResponse,
    ReviewCreate,
    ReviewListResponse,
    ReviewPublic,
    ReviewUpdate,
)

router = APIRouter(prefix="/products/{slug}/reviews", tags=["reviews"])


def _to_public(review: Review, author_label: str) -> ReviewPublic:
    return ReviewPublic(
        id=review.id,
        author_label=author_label,
        rating=review.rating,
        comment=review.comment,
        status=review.status,
        is_verified_purchase=review.order_id is not None,
        created_at=review.created_at,
    )


@router.get("", response_model=ReviewListResponse)
async def list_reviews(
    slug: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ReviewListResponse:
    product_id = await reviews_service.get_product_id_or_404(db, slug=slug)
    items, total = await reviews_service.list_reviews(
        db, product_id=product_id, page=page, page_size=page_size
    )
    return ReviewListResponse(
        items=[_to_public(review, label) for review, label in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/me", response_model=MyReviewResponse)
async def get_my_review(
    slug: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> MyReviewResponse:
    product_id = await reviews_service.get_product_id_or_404(db, slug=slug)
    review = await reviews_service.get_my_review(db, product_id=product_id, user_id=user.id)
    eligible = review is not None or await reviews_service.check_eligibility(
        db, product_id=product_id, user_id=user.id
    )
    return MyReviewResponse(
        eligible=eligible,
        review=_to_public(review, reviews_service.author_label(user)) if review else None,
    )


@router.post("", response_model=ReviewPublic, status_code=status.HTTP_201_CREATED)
async def create_review(
    slug: str,
    payload: ReviewCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ReviewPublic:
    product_id = await reviews_service.get_product_id_or_404(db, slug=slug)
    review = await reviews_service.create_review(
        db,
        product_id=product_id,
        user_id=user.id,
        rating=payload.rating,
        comment=payload.comment,
    )
    return _to_public(review, reviews_service.author_label(user))


@router.patch("/me", response_model=ReviewPublic)
async def update_my_review(
    slug: str,
    payload: ReviewUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ReviewPublic:
    product_id = await reviews_service.get_product_id_or_404(db, slug=slug)
    review = await reviews_service.update_my_review(
        db,
        product_id=product_id,
        user_id=user.id,
        updates=payload.model_dump(exclude_unset=True),
    )
    return _to_public(review, reviews_service.author_label(user))


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_review(
    slug: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    product_id = await reviews_service.get_product_id_or_404(db, slug=slug)
    await reviews_service.delete_my_review(db, product_id=product_id, user_id=user.id)
