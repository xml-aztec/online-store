import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db
from app.dependencies import get_current_user
from app.favorites import service as favorites_service
from app.favorites.schemas import FavoriteListResponse

router = APIRouter(prefix="/me/favorites", tags=["favorites"])


@router.get("", response_model=FavoriteListResponse)
async def list_favorites(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 24,
) -> FavoriteListResponse:
    items, total = await favorites_service.list_favorites(
        db, user_id=user.id, page=page, page_size=page_size
    )
    return FavoriteListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/ids", response_model=list[uuid.UUID])
async def list_favorite_ids(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[uuid.UUID]:
    return await favorites_service.list_favorite_product_ids(db, user_id=user.id)


@router.post("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_favorite(
    product_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    await favorites_service.add_favorite(db, user_id=user.id, product_id=product_id)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(
    product_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    await favorites_service.remove_favorite(db, user_id=user.id, product_id=product_id)
