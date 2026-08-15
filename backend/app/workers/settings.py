from typing import Any

from arq.connections import RedisSettings
from arq.cron import cron

from app.config import settings
from app.workers.tasks import (
    apply_import_job,
    cancel_expired_orders,
    process_banner_image,
    process_category_image,
    process_payment_succeeded,
    process_product_image,
    send_order_status_email,
    send_password_reset_email,
    send_set_password_email,
    send_telegram_daily_digest,
    send_telegram_low_stock,
    send_telegram_new_order,
    send_telegram_status_change,
    send_verification_email,
)


class WorkerSettings:
    functions: list[Any] = [
        send_verification_email,
        send_password_reset_email,
        send_set_password_email,
        process_product_image,
        process_banner_image,
        process_category_image,
        send_order_status_email,
        process_payment_succeeded,
        apply_import_job,
        send_telegram_new_order,
        send_telegram_status_change,
        send_telegram_low_stock,
        send_telegram_daily_digest,
    ]
    cron_jobs = [
        # Every minute -- expires_at deadlines are minute-granularity anyway (30 min TTL).
        cron(cancel_expired_orders, second=0),
        # ТЗ 5.6: 20:00 Asia/Bishkek. Bishkek is a fixed UTC+6 (no DST), so this
        # is spelled directly in UTC (14:00) rather than depending on the
        # worker container's TZ, which this codebase otherwise never assumes
        # (everything else is datetime.now(UTC) -- see app/orders/service.py).
        cron(send_telegram_daily_digest, hour=14, minute=0),
    ]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
