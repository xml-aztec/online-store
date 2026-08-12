"""One-time (or post-deploy) step: point Telegram at this API's webhook.

Not called automatically on app startup -- see ТЗ 5.6 ("вызывается один раз
при старте/деплое"). Run via `make telegram-webhook` / `make prod-telegram-webhook`.
"""

import asyncio
import sys

import structlog

from app.config import settings
from app.core.logging import configure_logging
from app.telegram import bot_api

logger = structlog.get_logger()


async def set_webhook() -> None:
    if not settings.telegram_bot_token:
        logger.error("telegram_webhook_setup_skipped", reason="TELEGRAM_BOT_TOKEN is not set")
        sys.exit(1)
    if not settings.public_base_url:
        logger.error("telegram_webhook_setup_skipped", reason="PUBLIC_BASE_URL is not set")
        sys.exit(1)

    url = f"{settings.public_base_url}/v1/webhooks/telegram"
    await bot_api.set_webhook(url, secret_token=settings.telegram_webhook_secret)
    logger.info("telegram_webhook_registered", url=url)


if __name__ == "__main__":
    configure_logging()
    asyncio.run(set_webhook())
