from typing import Any

from arq.connections import RedisSettings
from arq.cron import cron

from app.config import settings
from app.workers.tasks import (
    apply_import_job,
    cancel_expired_orders,
    process_payment_succeeded,
    process_product_image,
    send_order_status_email,
    send_password_reset_email,
    send_verification_email,
)


class WorkerSettings:
    functions: list[Any] = [
        send_verification_email,
        send_password_reset_email,
        process_product_image,
        send_order_status_email,
        process_payment_succeeded,
        apply_import_job,
    ]
    # Every minute -- expires_at deadlines are minute-granularity anyway (30 min TTL).
    cron_jobs = [cron(cancel_expired_orders, second=0)]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
