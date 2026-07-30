from functools import lru_cache

from redis.asyncio import Redis

from app.config import settings


@lru_cache
def get_redis() -> Redis:
    client: Redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return client
