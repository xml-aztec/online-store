from app.config import Settings

_REQUIRED = {
    "database_url": "postgresql+asyncpg://u:p@h/d",
    "redis_url": "redis://h/0",
    "s3_endpoint_url": "http://h:9000",
    "s3_bucket": "b",
    "s3_access_key": "a",
    "s3_secret_key": "s",
    "s3_public_url": "http://h/b",
}


def test_cors_origins_list_parses_csv() -> None:
    settings = Settings(**_REQUIRED, cors_origins="http://localhost, https://hobbylife.kg")

    assert settings.cors_origins_list == ["http://localhost", "https://hobbylife.kg"]


def test_payment_providers_list_parses_csv() -> None:
    settings = Settings(**_REQUIRED, payment_providers="mock, mbank")

    assert settings.payment_providers_list == ["mock", "mbank"]


def test_defaults_applied_when_not_set() -> None:
    settings = Settings(**_REQUIRED)

    assert settings.environment == "development"
    assert settings.jwt_access_token_ttl_minutes == 15
