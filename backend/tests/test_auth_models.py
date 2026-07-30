import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User


@pytest.mark.asyncio
async def test_user_role_check_constraint_rejects_invalid_role(db_session: AsyncSession) -> None:
    db_session.add(User(email="bad-role@example.com", role="superadmin"))

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_user_role_defaults_to_customer(db_session: AsyncSession) -> None:
    user = User(email="default-role@example.com")
    db_session.add(user)
    await db_session.flush()

    assert user.role == "customer"
