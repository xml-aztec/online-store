import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.config import settings
from app.database import get_db
from app.dependencies import require_role
from app.exceptions import DomainError
from app.telegram import service as telegram_service
from app.telegram.schemas import AdminTelegramLinkResponse, TelegramUpdate

router = APIRouter(tags=["telegram"])


@router.post("/webhooks/telegram")
async def telegram_webhook(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
) -> Response:
    # ТЗ 5.6 step 1: Telegram echoes back whatever secret_token setWebhook was
    # registered with -- a mismatch means this call didn't come from Telegram.
    received_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") or ""
    if not hmac.compare_digest(received_secret, settings.telegram_webhook_secret):
        raise DomainError(
            "Невалидный секрет webhook", code="INVALID_WEBHOOK_SECRET", status_code=401
        )

    update = TelegramUpdate.model_validate(await request.json())

    if update.callback_query is not None:
        await telegram_service.handle_callback(
            db, update_id=update.update_id, callback_query=update.callback_query
        )
    elif update.message is not None and update.message.text is not None:
        text = update.message.text.strip()
        if text.startswith("/start"):
            parts = text.split(maxsplit=1)
            token = parts[1] if len(parts) > 1 else None
            if token:
                await telegram_service.handle_start(
                    db, token=token, chat_id=str(update.message.chat.id)
                )
    # Anything else (plain chat messages, other commands) is silently ignored --
    # Telegram only cares that we respond 200 promptly.

    return JSONResponse({"status": "ok"})


@router.post("/admin/telegram/link", response_model=AdminTelegramLinkResponse)
async def create_telegram_link(
    user: Annotated[User, Depends(require_role("manager", "admin"))],
) -> AdminTelegramLinkResponse:
    link_url = await telegram_service.create_link_token(user.id)
    return AdminTelegramLinkResponse(link_url=link_url)
