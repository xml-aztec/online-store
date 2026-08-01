import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.core.security import create_access_token


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


async def _make_user(session: AsyncSession, *, role: str = "customer", **overrides: object) -> User:
    user = User(email=f"{_slug(role)}@example.com", role=role, **overrides)
    session.add(user)
    await session.flush()
    return user


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


@pytest.mark.asyncio
async def test_admin_users_requires_admin_role(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    manager = await _make_user(db_session, role="manager")
    await db_session.commit()

    no_auth = await client.get("/v1/admin/users")
    assert no_auth.status_code == 401

    wrong_role = await client.get("/v1/admin/users", headers=_headers(manager))
    assert wrong_role.status_code == 403


@pytest.mark.asyncio
async def test_list_users_search_by_email(client: AsyncClient, db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, role="admin")
    target = User(email="findme-unique@example.com", role="customer")
    db_session.add(target)
    await db_session.commit()

    response = await client.get(
        "/v1/admin/users", params={"search": "findme-unique"}, headers=_headers(admin)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["email"] == "findme-unique@example.com"


@pytest.mark.asyncio
async def test_update_user_role_and_active(client: AsyncClient, db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, role="admin")
    target = await _make_user(db_session, role="customer")
    await db_session.commit()

    response = await client.patch(
        f"/v1/admin/users/{target.id}",
        json={"role": "manager", "is_active": False},
        headers=_headers(admin),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "manager"
    assert body["is_active"] is False


@pytest.mark.asyncio
async def test_update_user_rejects_invalid_role(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await _make_user(db_session, role="admin")
    target = await _make_user(db_session, role="customer")
    await db_session.commit()

    response = await client.patch(
        f"/v1/admin/users/{target.id}", json={"role": "superuser"}, headers=_headers(admin)
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_ROLE"


@pytest.mark.asyncio
async def test_admin_cannot_demote_self(client: AsyncClient, db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, role="admin")
    await db_session.commit()

    response = await client.patch(
        f"/v1/admin/users/{admin.id}", json={"role": "customer"}, headers=_headers(admin)
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CANNOT_MODIFY_SELF"


@pytest.mark.asyncio
async def test_admin_cannot_deactivate_self(client: AsyncClient, db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, role="admin")
    await db_session.commit()

    response = await client.patch(
        f"/v1/admin/users/{admin.id}", json={"is_active": False}, headers=_headers(admin)
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CANNOT_MODIFY_SELF"


@pytest.mark.asyncio
async def test_admin_can_edit_own_full_name(client: AsyncClient, db_session: AsyncSession) -> None:
    # The self-lockout guard only blocks losing admin/active status, not other fields.
    admin = await _make_user(db_session, role="admin")
    await db_session.commit()

    response = await client.patch(
        f"/v1/admin/users/{admin.id}",
        json={"role": "admin", "is_active": True},
        headers=_headers(admin),
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_update_user_not_found(client: AsyncClient, db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, role="admin")
    await db_session.commit()

    response = await client.patch(
        f"/v1/admin/users/{uuid.uuid4()}", json={"role": "manager"}, headers=_headers(admin)
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "USER_NOT_FOUND"
