import pytest
from sqlalchemy import text

from app.database import get_db


@pytest.mark.asyncio
async def test_get_db_yields_working_session() -> None:
    async for session in get_db():
        result = await session.execute(text("SELECT 1"))
        assert result.scalar_one() == 1
        break
