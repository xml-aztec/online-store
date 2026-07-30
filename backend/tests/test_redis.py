import pytest

from app.core.redis import get_redis


@pytest.mark.asyncio
async def test_redis_set_get_roundtrip() -> None:
    redis = get_redis()

    await redis.set("hobbylife:test:ping", "pong", ex=5)
    value = await redis.get("hobbylife:test:ping")
    await redis.delete("hobbylife:test:ping")

    assert value == "pong"
