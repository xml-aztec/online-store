import uuid
from collections.abc import AsyncGenerator
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.core.security import create_access_token
from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.exceptions import register_exception_handlers


def _build_app(db_session: AsyncSession) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    @app.get("/me")
    async def me(user: Annotated[User, Depends(get_current_user)]) -> dict[str, str]:
        return {"id": str(user.id)}

    @app.get("/admin-only")
    async def admin_only(
        user: Annotated[User, Depends(require_role("admin"))],
    ) -> dict[str, str]:
        return {"id": str(user.id)}

    return app


async def _make_user(session: AsyncSession, **overrides: object) -> User:
    user = User(email=f"dep-{uuid.uuid4().hex[:10]}@example.com", role="customer", **overrides)
    session.add(user)
    await session.flush()
    return user


@pytest.mark.asyncio
async def test_get_current_user_requires_authorization_header(db_session: AsyncSession) -> None:
    transport = ASGITransport(app=_build_app(db_session))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/me")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_rejects_garbage_token(db_session: AsyncSession) -> None:
    transport = ASGITransport(app=_build_app(db_session))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/me", headers={"Authorization": "Bearer garbage"})

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_accepts_valid_token(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    token = create_access_token(user.id, user.role)

    transport = ASGITransport(app=_build_app(db_session))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {"id": str(user.id)}


@pytest.mark.asyncio
async def test_require_role_rejects_wrong_role(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    token = create_access_token(user.id, user.role)

    transport = ASGITransport(app=_build_app(db_session))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/admin-only", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_current_user_rejects_inactive_user(db_session: AsyncSession) -> None:
    user = await _make_user(db_session, is_active=False)
    token = create_access_token(user.id, user.role)

    transport = ASGITransport(app=_build_app(db_session))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
