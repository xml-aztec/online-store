from app.core.redis import get_redis

# (max attempts, window in seconds) -- see ТЗ 5.5.
LOGIN_RATE_LIMIT = (5, 15 * 60)
REGISTER_RATE_LIMIT = (3, 60 * 60)


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
