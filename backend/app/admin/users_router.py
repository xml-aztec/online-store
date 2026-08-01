import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.schemas import AdminUserListResponse, AdminUserPublic, AdminUserUpdate
from app.auth import service as auth_service
from app.auth.models import User
from app.database import get_db
from app.dependencies import require_role

router = APIRouter(
    prefix="/admin", tags=["admin-users"], dependencies=[Depends(require_role("admin"))]
)


def _user_to_public(user: User) -> AdminUserPublic:
    return AdminUserPublic(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        email_verified=user.email_verified_at is not None,
        created_at=user.created_at,
    )


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    search: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 24,
) -> AdminUserListResponse:
    users, total = await auth_service.list_users_admin(
        db, search=search, page=page, page_size=page_size
    )
    return AdminUserListResponse(
        items=[_user_to_public(user) for user in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.patch("/users/{user_id}", response_model=AdminUserPublic)
async def update_user(
    user_id: uuid.UUID,
    payload: AdminUserUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    acting_admin: Annotated[User, Depends(require_role("admin"))],
) -> AdminUserPublic:
    user = await auth_service.update_user_admin(
        db,
        user_id=user_id,
        acting_admin_id=acting_admin.id,
        updates=payload.model_dump(exclude_unset=True),
    )
    return _user_to_public(user)
