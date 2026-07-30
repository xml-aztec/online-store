from arq.connections import RedisSettings

from app.config import settings
from app.workers.tasks import send_password_reset_email, send_verification_email


class WorkerSettings:
    functions = [send_verification_email, send_password_reset_email]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
