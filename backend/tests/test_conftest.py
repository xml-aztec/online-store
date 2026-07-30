import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database import engine


@pytest.mark.asyncio
async def test_db_session_fixture_provides_working_session(db_session: AsyncSession) -> None:
    result = await db_session.execute(text("SELECT 1"))
    assert result.scalar_one() == 1


@pytest.mark.asyncio
async def test_client_fixture_hits_real_app(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_transaction_rollback_discards_changes() -> None:
    connection = await engine.connect()
    transaction = await connection.begin()
    session_factory = async_sessionmaker(
        bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )
    session = session_factory()

    await session.execute(text("CREATE TABLE pytest_isolation_check (id int)"))
    await session.execute(text("INSERT INTO pytest_isolation_check VALUES (1)"))
    await session.commit()  # only commits the savepoint, not the outer transaction

    result = await session.execute(text("SELECT COUNT(*) FROM pytest_isolation_check"))
    assert result.scalar_one() == 1

    await session.close()
    await transaction.rollback()
    await connection.close()

    async with engine.connect() as verify_connection:
        exists = await verify_connection.execute(
            text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
                "WHERE table_name = 'pytest_isolation_check')"
            )
        )
        assert exists.scalar_one() is False
