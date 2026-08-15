import uuid
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Address, User
from app.exceptions import DomainError


async def update_profile(session: AsyncSession, user: User, *, updates: dict[str, Any]) -> User:
    for key, value in updates.items():
        setattr(user, key, value)
    await session.commit()
    return user


async def list_addresses(session: AsyncSession, *, user_id: uuid.UUID) -> list[Address]:
    rows = await session.scalars(
        select(Address).where(Address.user_id == user_id).order_by(Address.created_at)
    )
    return list(rows.all())


async def _get_address_or_404(
    session: AsyncSession, *, user_id: uuid.UUID, address_id: uuid.UUID
) -> Address:
    address = await session.scalar(
        select(Address).where(Address.id == address_id, Address.user_id == user_id)
    )
    if address is None:
        raise DomainError("Адрес не найден", code="ADDRESS_NOT_FOUND", status_code=404)
    return address


async def create_address(
    session: AsyncSession, *, user_id: uuid.UUID, data: dict[str, Any]
) -> Address:
    existing_count = await session.scalar(
        select(func.count()).select_from(Address).where(Address.user_id == user_id)
    )
    if existing_count == 0:
        # The very first address has nothing to be "default" relative to --
        # make it the default automatically so the user isn't required to
        # click a toggle that, right now, can only mean one thing anyway.
        data = {**data, "is_default": True}
    elif data.get("is_default"):
        await session.execute(
            update(Address).where(Address.user_id == user_id).values(is_default=False)
        )

    address = Address(user_id=user_id, **data)
    session.add(address)
    await session.commit()
    return address


async def update_address(
    session: AsyncSession, *, user_id: uuid.UUID, address_id: uuid.UUID, updates: dict[str, Any]
) -> Address:
    address = await _get_address_or_404(session, user_id=user_id, address_id=address_id)

    if updates.get("is_default"):
        await session.execute(
            update(Address).where(Address.user_id == user_id).values(is_default=False)
        )

    for key, value in updates.items():
        setattr(address, key, value)
    await session.commit()
    return address


async def delete_address(
    session: AsyncSession, *, user_id: uuid.UUID, address_id: uuid.UUID
) -> None:
    address = await _get_address_or_404(session, user_id=user_id, address_id=address_id)
    await session.delete(address)
    await session.commit()
