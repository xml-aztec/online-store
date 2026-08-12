from decimal import Decimal
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    environment: str = "development"

    database_url: str
    redis_url: str

    s3_endpoint_url: str
    s3_bucket: str
    s3_access_key: str
    s3_secret_key: str
    s3_public_url: str

    domain: str = "localhost"
    cors_origins: str = "http://localhost"

    jwt_secret_key: str = "change-me-in-production"
    jwt_access_token_ttl_minutes: int = 15
    jwt_refresh_token_ttl_days: int = 30

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "no-reply@hobbylife.kg"

    payment_providers: str = "mock"
    payment_webhook_secret: str = "change-me-in-production"

    courier_delivery_cost: Decimal = Decimal("150")
    free_delivery_threshold: Decimal = Decimal("3000")

    # ТЗ 5.6: Telegram-бот для админов. Empty token/secret means the feature is
    # simply inert (webhook route 401s, notify_* no-op) -- no separate feature
    # flag needed, matching how payment_providers="" already disables online pay.
    telegram_bot_token: str = ""
    telegram_bot_username: str = ""
    telegram_webhook_secret: str = "change-me-in-production"
    telegram_low_stock_threshold: int = 5
    # Public HTTPS origin this API is reachable at (e.g. "https://api.hobbylife.kg"),
    # used only to register the webhook URL with Telegram (see app/scripts/
    # set_telegram_webhook.py) -- never touched on every app startup/request.
    public_base_url: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def payment_providers_list(self) -> list[str]:
        return [
            provider.strip() for provider in self.payment_providers.split(",") if provider.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
