import uuid
from typing import Any

from app.auth.models import User
from app.config import settings
from app.core.email import send_email
from app.database import async_session_factory


async def send_verification_email(ctx: dict[str, Any], *, user_id: str, token: str) -> None:
    async with async_session_factory() as session:
        user = await session.get(User, uuid.UUID(user_id))
        if user is None:
            return

        verify_url = f"{settings.domain}/verify-email?token={token}"
        await send_email(
            to=user.email,
            subject="Подтверждение email — HobbyLife",
            template_name="verify_email.html",
            context={"full_name": user.full_name, "verify_url": verify_url},
        )


async def send_password_reset_email(ctx: dict[str, Any], *, user_id: str, token: str) -> None:
    async with async_session_factory() as session:
        user = await session.get(User, uuid.UUID(user_id))
        if user is None:
            return

        reset_url = f"{settings.domain}/reset-password?token={token}"
        await send_email(
            to=user.email,
            subject="Восстановление пароля — HobbyLife",
            template_name="reset_password.html",
            context={"full_name": user.full_name, "reset_url": reset_url},
        )
