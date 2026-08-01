import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.schemas import (
    AdminPromoCodeCreate,
    AdminPromoCodeListResponse,
    AdminPromoCodePublic,
    AdminPromoCodeUpdate,
)
from app.database import get_db
from app.dependencies import require_role
from app.orders import service as orders_service
from app.orders.models import PromoCode

router = APIRouter(
    prefix="/admin", tags=["admin-promo-codes"], dependencies=[Depends(require_role("admin"))]
)


def _promo_to_public(promo: PromoCode) -> AdminPromoCodePublic:
    return AdminPromoCodePublic(
        id=promo.id,
        code=promo.code,
        discount_type=promo.discount_type,
        discount_value=promo.discount_value,
        min_order_total=promo.min_order_total,
        starts_at=promo.starts_at,
        ends_at=promo.ends_at,
        max_uses=promo.max_uses,
        used_count=promo.used_count,
        is_active=promo.is_active,
        created_at=promo.created_at,
    )


@router.post(
    "/promo-codes", response_model=AdminPromoCodePublic, status_code=status.HTTP_201_CREATED
)
async def create_promo_code(
    payload: AdminPromoCodeCreate, db: Annotated[AsyncSession, Depends(get_db)]
) -> AdminPromoCodePublic:
    promo = await orders_service.create_promo_code_admin(
        db,
        code=payload.code,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        min_order_total=payload.min_order_total,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        max_uses=payload.max_uses,
        is_active=payload.is_active,
    )
    return _promo_to_public(promo)


@router.get("/promo-codes", response_model=AdminPromoCodeListResponse)
async def list_promo_codes(
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 24,
) -> AdminPromoCodeListResponse:
    promos, total = await orders_service.list_promo_codes_admin(db, page=page, page_size=page_size)
    return AdminPromoCodeListResponse(
        items=[_promo_to_public(promo) for promo in promos],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/promo-codes/{promo_code_id}", response_model=AdminPromoCodePublic)
async def get_promo_code(
    promo_code_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]
) -> AdminPromoCodePublic:
    promo = await orders_service.get_promo_code_admin(db, promo_code_id=promo_code_id)
    return _promo_to_public(promo)


@router.patch("/promo-codes/{promo_code_id}", response_model=AdminPromoCodePublic)
async def update_promo_code(
    promo_code_id: uuid.UUID,
    payload: AdminPromoCodeUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminPromoCodePublic:
    promo = await orders_service.update_promo_code_admin(
        db, promo_code_id=promo_code_id, updates=payload.model_dump(exclude_unset=True)
    )
    return _promo_to_public(promo)


@router.delete("/promo-codes/{promo_code_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_promo_code(
    promo_code_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]
) -> None:
    await orders_service.delete_promo_code_admin(db, promo_code_id=promo_code_id)
