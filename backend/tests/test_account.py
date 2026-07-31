import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.core.security import create_access_token


async def _make_user(db_session: AsyncSession) -> User:
    user = User(email=f"user-{uuid.uuid4().hex[:10]}@example.com", full_name="Иван")
    db_session.add(user)
    await db_session.commit()
    return user


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


@pytest.mark.asyncio
async def test_get_me_returns_profile(client: httpx.AsyncClient, db_session: AsyncSession) -> None:
    user = await _make_user(db_session)

    response = await client.get("/v1/me", headers=_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == user.email
    assert body["full_name"] == "Иван"


@pytest.mark.asyncio
async def test_get_me_requires_authentication(client: httpx.AsyncClient) -> None:
    response = await client.get("/v1/me")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_patch_me_updates_profile(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)

    response = await client.patch(
        "/v1/me", json={"full_name": "Пётр", "phone": "+996700000001"}, headers=_headers(user)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Пётр"

    await db_session.refresh(user)
    assert user.phone == "+996700000001"


@pytest.mark.asyncio
async def test_address_crud_lifecycle(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _headers(user)

    create_response = await client.post(
        "/v1/me/addresses",
        json={"city": "Бишкек", "street": "Чуй", "building": "10", "is_default": True},
        headers=headers,
    )
    assert create_response.status_code == 201
    address_id = create_response.json()["id"]
    assert create_response.json()["is_default"] is True

    list_response = await client.get("/v1/me/addresses", headers=headers)
    assert len(list_response.json()) == 1

    update_response = await client.patch(
        f"/v1/me/addresses/{address_id}", json={"building": "12"}, headers=headers
    )
    assert update_response.status_code == 200
    assert update_response.json()["building"] == "12"

    delete_response = await client.delete(f"/v1/me/addresses/{address_id}", headers=headers)
    assert delete_response.status_code == 204

    empty_list = await client.get("/v1/me/addresses", headers=headers)
    assert empty_list.json() == []


@pytest.mark.asyncio
async def test_setting_new_default_address_unsets_previous_default(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    user = await _make_user(db_session)
    headers = _headers(user)

    first = await client.post(
        "/v1/me/addresses",
        json={"city": "Бишкек", "street": "Чуй", "building": "1", "is_default": True},
        headers=headers,
    )
    second = await client.post(
        "/v1/me/addresses",
        json={"city": "Бишкек", "street": "Ленина", "building": "2", "is_default": True},
        headers=headers,
    )
    assert first.status_code == 201
    assert second.status_code == 201

    addresses = (await client.get("/v1/me/addresses", headers=headers)).json()
    defaults = [address for address in addresses if address["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["id"] == second.json()["id"]


@pytest.mark.asyncio
async def test_address_not_found_for_other_user(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _make_user(db_session)
    intruder = await _make_user(db_session)

    created = await client.post(
        "/v1/me/addresses",
        json={"city": "Бишкек", "street": "Чуй", "building": "1"},
        headers=_headers(owner),
    )
    address_id = created.json()["id"]

    response = await client.patch(
        f"/v1/me/addresses/{address_id}", json={"building": "99"}, headers=_headers(intruder)
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ADDRESS_NOT_FOUND"
