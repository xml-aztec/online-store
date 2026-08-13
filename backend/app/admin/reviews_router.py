import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.schemas import (
    AdminReviewListResponse,
    AdminReviewModerateRequest,
    AdminReviewPublic,
)
from app.database import get_db
from app.dependencies import require_role
from app.reviews import service as reviews_service
from app.reviews.models import Review

router = APIRouter(
    prefix="/admin",
    tags=["admin-reviews"],
    dependencies=[Depends(require_role("manager", "admin"))],
)


def _to_public(review: Review, author_label: str, product_name: str) -> AdminReviewPublic:
    return AdminReviewPublic(
        id=review.id,
        product_id=review.product_id,
        product_name=product_name,
        author_label=author_label,
        rating=review.rating,
        comment=review.comment,
        status=review.status,
        is_verified_purchase=review.order_id is not None,
        created_at=review.created_at,
    )


@router.get("/reviews", response_model=AdminReviewListResponse)
async def list_reviews(
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> AdminReviewListResponse:
    items, total = await reviews_service.list_reviews_admin(
        db, status_filter=status_filter, page=page, page_size=page_size
    )
    return AdminReviewListResponse(
        items=[_to_public(review, label, product_name) for review, label, product_name in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/reviews/{review_id}/moderate", response_model=AdminReviewPublic)
async def moderate_review(
    review_id: uuid.UUID,
    payload: AdminReviewModerateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminReviewPublic:
    await reviews_service.moderate_review(db, review_id=review_id, status=payload.status)
    review, label, product_name = await reviews_service.get_review_context(
        db, review_id=review_id
    )
    return _to_public(review, label, product_name)
