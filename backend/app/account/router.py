import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.account import service as account_service
from app.account.schemas import AddressCreate, AddressPublic, AddressUpdate, UpdateMeRequest
from app.auth.models import Address, User
from app.auth.schemas import UserPublic
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(tags=["account"])


def _address_to_public(address: Address) -> AddressPublic:
    return AddressPublic(
        id=address.id,
        label=address.label,
        city=address.city,
        street=address.street,
        building=address.building,
        apartment=address.apartment,
        postal_code=address.postal_code,
        comment=address.comment,
        is_default=address.is_default,
    )


@router.get("/me", response_model=UserPublic)
async def get_me(user: Annotated[User, Depends(get_current_user)]) -> UserPublic:
    return UserPublic.from_model(user)


@router.patch("/me", response_model=UserPublic)
async def update_me(
    payload: UpdateMeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> UserPublic:
    updated = await account_service.update_profile(
        db, user, updates=payload.model_dump(exclude_unset=True)
    )
    return UserPublic.from_model(updated)


@router.get("/me/addresses", response_model=list[AddressPublic])
async def list_addresses(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[AddressPublic]:
    addresses = await account_service.list_addresses(db, user_id=user.id)
    return [_address_to_public(address) for address in addresses]


@router.post("/me/addresses", response_model=AddressPublic, status_code=status.HTTP_201_CREATED)
async def create_address(
    payload: AddressCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> AddressPublic:
    address = await account_service.create_address(db, user_id=user.id, data=payload.model_dump())
    return _address_to_public(address)


@router.patch("/me/addresses/{address_id}", response_model=AddressPublic)
async def update_address(
    address_id: uuid.UUID,
    payload: AddressUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> AddressPublic:
    address = await account_service.update_address(
        db, user_id=user.id, address_id=address_id, updates=payload.model_dump(exclude_unset=True)
    )
    return _address_to_public(address)


@router.delete("/me/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(
    address_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    await account_service.delete_address(db, user_id=user.id, address_id=address_id)
