import asyncio
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import Category


@pytest.mark.asyncio
async def test_updated_at_trigger_refreshes_on_update(db_session: AsyncSession) -> None:
    category = Category(name="Ванночки", slug=f"tubs-{uuid.uuid4().hex[:8]}")
    db_session.add(category)
    await db_session.flush()
    created_at, first_updated_at = category.created_at, category.updated_at

    await asyncio.sleep(0.01)
    category.name = "Детские ванночки"
    await db_session.flush()
    await db_session.refresh(category)

    assert category.created_at == created_at
    assert category.updated_at > first_updated_at
