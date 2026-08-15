from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service as auth_service
from app.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserPublic,
    VerifyEmailRequest,
)
from app.cart import service as cart_service
from app.config import settings
from app.core.rate_limit import LOGIN_RATE_LIMIT, REGISTER_RATE_LIMIT, check_rate_limit, client_ip
from app.database import get_db
from app.exceptions import DomainError

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_COOKIE_NAME = "refresh_token"


def _set_refresh_cookie(response: Response, raw_refresh_token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE_NAME,
        value=raw_refresh_token,
        max_age=settings.jwt_refresh_token_ttl_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.environment == "production",
        samesite="lax",
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=_REFRESH_COOKIE_NAME, path="/")


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserPublic:
    await check_rate_limit(f"ratelimit:register:{client_ip(request)}", *REGISTER_RATE_LIMIT)
    user = await auth_service.register(
        db, email=payload.email, password=payload.password, full_name=payload.full_name
    )
    return UserPublic.from_model(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    await check_rate_limit(
        f"ratelimit:login:{payload.email}:{client_ip(request)}", *LOGIN_RATE_LIMIT
    )
    user = await auth_service.authenticate(db, email=payload.email, password=payload.password)
    access_token, raw_refresh_token = await auth_service.issue_tokens(db, user)
    _set_refresh_cookie(response, raw_refresh_token)

    cart_id = request.cookies.get(cart_service.CART_COOKIE_NAME)
    if cart_id:
        await cart_service.merge_guest_cart_into_user(db, cart_id=cart_id, user_id=user.id)

    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
    refresh_token: Annotated[str | None, Cookie(alias=_REFRESH_COOKIE_NAME)] = None,
) -> TokenResponse:
    if refresh_token is None:
        raise DomainError(
            "Требуется refresh-токен", code="INVALID_REFRESH_TOKEN", status_code=401
        )

    access_token, new_raw_refresh_token = await auth_service.refresh_tokens(
        db, raw_refresh_token=refresh_token
    )
    _set_refresh_cookie(response, new_raw_refresh_token)
    return TokenResponse(access_token=access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
    refresh_token: Annotated[str | None, Cookie(alias=_REFRESH_COOKIE_NAME)] = None,
) -> None:
    if refresh_token is not None:
        await auth_service.logout(db, raw_refresh_token=refresh_token)
    _clear_refresh_cookie(response)


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(
    payload: VerifyEmailRequest, db: Annotated[AsyncSession, Depends(get_db)]
) -> MessageResponse:
    await auth_service.verify_email(db, token=payload.token)
    return MessageResponse(message="Email подтверждён")


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    payload: ForgotPasswordRequest, db: Annotated[AsyncSession, Depends(get_db)]
) -> MessageResponse:
    await auth_service.forgot_password(db, email=payload.email)
    return MessageResponse(message="На данный email отправлено письмо с инструкциями по восстановлению пароля")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    payload: ResetPasswordRequest, db: Annotated[AsyncSession, Depends(get_db)]
) -> MessageResponse:
    await auth_service.reset_password(db, token=payload.token, new_password=payload.new_password)
    return MessageResponse(message="Пароль изменён")
