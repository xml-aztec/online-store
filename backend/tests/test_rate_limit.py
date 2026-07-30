import uuid

import pytest

from app.core.rate_limit import RateLimitExceeded, enforce_rate_limit


@pytest.mark.asyncio
async def test_enforce_rate_limit_blocks_after_limit_reached() -> None:
    key = f"test:ratelimit:{uuid.uuid4()}"

    for _ in range(3):
        await enforce_rate_limit(key, limit=3, window_seconds=60)

    with pytest.raises(RateLimitExceeded):
        await enforce_rate_limit(key, limit=3, window_seconds=60)
