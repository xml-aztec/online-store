import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import RefreshToken, User
from app.config import settings
from app.core.queue import get_arq_pool
from app.core.security import (
    TokenError,
    create_access_token,
    create_email_action_token,
    decode_email_action_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    password_fingerprint,
    verify_password,
)
from app.exceptions import DomainError

_EMAIL_VERIFICATION_TTL = timedelta(hours=24)
_PASSWORD_RESET_TTL = timedelta(hours=1)


async def register(
    session: AsyncSession, *, email: str, password: str, full_name: str | None
) -> User:
    existing = await session.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise DomainError(
            "Пользователь с таким email уже зарегистрирован",
            code="EMAIL_ALREADY_REGISTERED",
            status_code=409,
        )

    user = User(email=email, password_hash=hash_password(password), full_name=full_name)
    session.add(user)
    await session.flush()

    token = create_email_action_token(
        user_id=user.id, purpose="email_verification", ttl=_EMAIL_VERIFICATION_TTL
    )
    pool = await get_arq_pool()
    await pool.enqueue_job("send_verification_email", user_id=str(user.id), token=token)

    await session.commit()
    return user


async def authenticate(session: AsyncSession, *, email: str, password: str) -> User:
    user = await session.scalar(select(User).where(User.email == email))
    if (
        user is None
        or user.password_hash is None
        or not user.is_active
        or not verify_password(password, user.password_hash)
    ):
        raise DomainError("Неверный email или пароль", code="INVALID_CREDENTIALS", status_code=401)

    return user


async def issue_tokens(session: AsyncSession, user: User) -> tuple[str, str]:
    access_token = create_access_token(user.id, user.role)
    raw_refresh_token = generate_refresh_token()

    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=settings.jwt_refresh_token_ttl_days),
        )
    )
    await session.commit()
    return access_token, raw_refresh_token


async def refresh_tokens(session: AsyncSession, *, raw_refresh_token: str) -> tuple[str, str]:
    token_hash = hash_refresh_token(raw_refresh_token)
    refresh_token = await session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    if refresh_token is None:
        raise DomainError(
            "Невалидный refresh-токен", code="INVALID_REFRESH_TOKEN", status_code=401
        )

    now = datetime.now(UTC)
    if refresh_token.revoked_at is not None or refresh_token.expires_at < now:
        raise DomainError(
            "Refresh-токен отозван или истёк", code="INVALID_REFRESH_TOKEN", status_code=401
        )

    user = await session.get(User, refresh_token.user_id)
    if user is None or not user.is_active:
        raise DomainError(
            "Невалидный refresh-токен", code="INVALID_REFRESH_TOKEN", status_code=401
        )

    refresh_token.revoked_at = now

    access_token = create_access_token(user.id, user.role)
    new_raw_refresh_token = generate_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(new_raw_refresh_token),
            expires_at=now + timedelta(days=settings.jwt_refresh_token_ttl_days),
        )
    )
    await session.commit()
    return access_token, new_raw_refresh_token


async def logout(session: AsyncSession, *, raw_refresh_token: str) -> None:
    token_hash = hash_refresh_token(raw_refresh_token)
    refresh_token = await session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    if refresh_token is not None and refresh_token.revoked_at is None:
        refresh_token.revoked_at = datetime.now(UTC)
        await session.commit()


async def verify_email(session: AsyncSession, *, token: str) -> None:
    try:
        payload = decode_email_action_token(token, expected_purpose="email_verification")
    except TokenError as exc:
        raise DomainError(
            "Невалидный или просроченный токен", code="INVALID_TOKEN", status_code=400
        ) from exc

    user = await session.get(User, payload.user_id)
    if user is None:
        raise DomainError(
            "Невалидный или просроченный токен", code="INVALID_TOKEN", status_code=400
        )

    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(UTC)
        await session.commit()


async def get_or_create_guest_account(
    session: AsyncSession, *, email: str, full_name: str, phone: str
) -> User | None:
    """For guest checkout only (ТЗ 4: `password_hash` may be NULL for an
    account created this way). Returns the user the order should be
    associated with, or None if an account with this email already exists --
    a guest order must never get silently attached to someone else's
    existing account just because the email typed at checkout happens to
    match it.

    Doesn't send the "set password" email itself -- that needs the order
    number, which doesn't exist yet at this point in checkout (see
    app/orders/router.py::checkout, which calls enqueue_set_password_email
    once the order is actually created).
    """
    existing = await session.scalar(select(User).where(User.email == email))
    if existing is not None:
        return None

    user = User(email=email, full_name=full_name, phone=phone, password_hash=None)
    session.add(user)
    await session.flush()
    return user


async def enqueue_set_password_email(*, user_id: uuid.UUID, order_number: str) -> None:
    token = create_email_action_token(
        user_id=user_id, purpose="password_reset", ttl=_PASSWORD_RESET_TTL, password_hash=None
    )
    pool = await get_arq_pool()
    await pool.enqueue_job(
        "send_set_password_email",
        user_id=str(user_id),
        token=token,
        order_number=order_number,
    )


async def forgot_password(session: AsyncSession, *, email: str) -> None:
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        return

    token = create_email_action_token(
        user_id=user.id,
        purpose="password_reset",
        ttl=_PASSWORD_RESET_TTL,
        password_hash=user.password_hash,
    )
    pool = await get_arq_pool()
    await pool.enqueue_job("send_password_reset_email", user_id=str(user.id), token=token)


async def reset_password(session: AsyncSession, *, token: str, new_password: str) -> None:
    try:
        payload = decode_email_action_token(token, expected_purpose="password_reset")
    except TokenError as exc:
        raise DomainError(
            "Невалидный или просроченный токен", code="INVALID_TOKEN", status_code=400
        ) from exc

    user = await session.get(User, payload.user_id)
    if user is None or password_fingerprint(user.password_hash) != payload.password_fingerprint:
        raise DomainError(
            "Невалидный или просроченный токен", code="INVALID_TOKEN", status_code=400
        )

    user.password_hash = hash_password(new_password)
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    await session.commit()


# --- Admin: users (ТЗ 6.4) ---


async def list_users_admin(
    session: AsyncSession, *, search: str | None, page: int, page_size: int
) -> tuple[list[User], int]:
    conditions = []
    if search:
        pattern = f"%{search}%"
        conditions.append(User.email.ilike(pattern))

    total = (
        await session.scalar(select(func.count()).select_from(User).where(*conditions))
    ) or 0
    rows = (
        await session.scalars(
            select(User)
            .where(*conditions)
            .order_by(User.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return list(rows), total


async def get_user_admin(session: AsyncSession, *, user_id: uuid.UUID) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise DomainError("Пользователь не найден", code="USER_NOT_FOUND", status_code=404)
    return user


_VALID_ROLES = ("customer", "manager", "admin")


async def update_user_admin(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    acting_admin_id: uuid.UUID,
    updates: dict[str, Any],
) -> User:
    user = await get_user_admin(session, user_id=user_id)

    new_role = updates.get("role")
    if new_role is not None and new_role not in _VALID_ROLES:
        raise DomainError(
            "Роль должна быть 'customer', 'manager' или 'admin'",
            code="INVALID_ROLE",
            status_code=422,
        )

    # An admin locking themselves out (demoting or deactivating their own only
    # admin account) has no recovery path short of the DEPLOY.md raw-SQL
    # workaround this endpoint exists to make unnecessary -- block it outright.
    if user.id == acting_admin_id:
        would_lose_admin = updates.get("role", user.role) != "admin"
        would_deactivate = updates.get("is_active", user.is_active) is False
        if would_lose_admin or would_deactivate:
            raise DomainError(
                "Нельзя снять с себя роль admin или деактивировать свою учётную запись",
                code="CANNOT_MODIFY_SELF",
                status_code=409,
            )

    for field, value in updates.items():
        setattr(user, field, value)

    await session.commit()
    return user
