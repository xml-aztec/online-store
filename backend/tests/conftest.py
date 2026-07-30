import subprocess
import sys
import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.catalog.service import invalidate_category_cache
from app.database import engine, get_db
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def apply_migrations() -> None:
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)


@pytest_asyncio.fixture(autouse=True)
async def _clear_category_cache() -> AsyncGenerator[None, None]:
    # Redis state (unlike db_session) isn't rolled back per test -- a cached tree from
    # one test would otherwise leak into the next test's assertions.
    await invalidate_category_cache()
    yield
    await invalidate_category_cache()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    connection = await engine.connect()
    transaction = await connection.begin()
    session_factory = async_sessionmaker(
        bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )
    session = session_factory()

    try:
        yield session
    finally:
        await session.close()
        await transaction.rollback()
        await connection.close()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    # Unique fake client IP per test -- otherwise IP-keyed rate limits (Redis state,
    # not rolled back like db_session) would accumulate across unrelated tests.
    transport = ASGITransport(app=app, client=(f"test-{uuid.uuid4().hex[:12]}", 12345))
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()
