from fastapi import Request

from app.core.redis import get_redis
from app.exceptions import DomainError

# (max attempts, window in seconds) -- see ТЗ 5.5.
LOGIN_RATE_LIMIT = (5, 15 * 60)
REGISTER_RATE_LIMIT = (3, 60 * 60)
ORDER_CREATE_RATE_LIMIT = (10, 60 * 60)


class RateLimitExceeded(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Rate limit exceeded")
        self.retry_after_seconds = retry_after_seconds


async def enforce_rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    redis = get_redis()
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, window_seconds)

    if current > limit:
        ttl = await redis.ttl(key)
        raise RateLimitExceeded(retry_after_seconds=max(ttl, 1))


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def check_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    try:
        await enforce_rate_limit(key, limit=limit, window_seconds=window_seconds)
    except RateLimitExceeded as exc:
        raise DomainError(
            "Слишком много попыток, попробуйте позже",
            code="RATE_LIMITED",
            status_code=429,
            details={"retry_after_seconds": exc.retry_after_seconds},
        ) from exc
