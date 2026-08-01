from collections.abc import Callable
from typing import Annotated

import structlog
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.core.security import TokenError, decode_access_token
from app.database import get_db
from app.exceptions import DomainError

_bearer_scheme = HTTPBearer(auto_error=False)


async def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User | None:
    if credentials is None:
        return None

    try:
        payload = decode_access_token(credentials.credentials)
    except TokenError as exc:
        raise DomainError("Невалидный токен", code="INVALID_TOKEN", status_code=401) from exc

    user = await db.get(User, payload.user_id)
    if user is None or not user.is_active:
        raise DomainError("Пользователь не найден", code="USER_NOT_FOUND", status_code=401)

    # ТЗ 8: user_id in every log line for the request -- bound once here rather
    # than threaded through every endpoint/service call.
    structlog.contextvars.bind_contextvars(user_id=str(user.id))

    return user


async def get_current_user(user: Annotated[User | None, Depends(get_optional_user)]) -> User:
    if user is None:
        raise DomainError("Требуется авторизация", code="NOT_AUTHENTICATED", status_code=401)
    return user


def require_role(*allowed_roles: str) -> Callable[[User], User]:
    def checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in allowed_roles:
            raise DomainError("Недостаточно прав", code="FORBIDDEN", status_code=403)
        return user

    return checker
