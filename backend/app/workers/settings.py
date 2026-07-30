from typing import Any

from arq.connections import RedisSettings

from app.config import settings
from app.workers.tasks import (
    process_product_image,
    send_password_reset_email,
    send_verification_email,
)


class WorkerSettings:
    functions: list[Any] = [
        send_verification_email,
        send_password_reset_email,
        process_product_image,
    ]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
