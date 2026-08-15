import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.core.security import create_access_token


async def _make_user(session: AsyncSession, *, role: str) -> User:
    user = User(email=f"{role}-{uuid.uuid4().hex[:10]}@example.com", role=role)
    session.add(user)
    await session.flush()
    return user


async def _admin_headers(session: AsyncSession) -> dict[str, str]:
    user = await _make_user(session, role="admin")
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


async def _create_message(
    client: httpx.AsyncClient, headers: dict[str, str], message: str
) -> httpx.Response:
    return await client.post(
        "/v1/admin/promo-messages", json={"message": message}, headers=headers
    )


@pytest.mark.asyncio
async def test_admin_promo_message_endpoints_require_admin_role(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    no_auth = await client.get("/v1/admin/promo-messages")
    assert no_auth.status_code == 401

    customer = await _make_user(db_session, role="customer")
    customer_headers = {
        "Authorization": f"Bearer {create_access_token(customer.id, customer.role)}"
    }
    forbidden = await client.get("/v1/admin/promo-messages", headers=customer_headers)
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_create_update_delete_promo_message(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)

    created = await _create_message(client, headers, "Бесплатная доставка от 3000 сом")
    assert created.status_code == 201
    body = created.json()
    assert body["message"] == "Бесплатная доставка от 3000 сом"
    assert body["is_active"] is True
    message_id = body["id"]

    update_response = await client.patch(
        f"/v1/admin/promo-messages/{message_id}",
        json={"message": "Оплата при получении", "is_active": False},
        headers=headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["message"] == "Оплата при получении"
    assert update_response.json()["is_active"] is False

    list_response = await client.get("/v1/admin/promo-messages", headers=headers)
    assert len(list_response.json()) == 1

    delete_response = await client.delete(
        f"/v1/admin/promo-messages/{message_id}", headers=headers
    )
    assert delete_response.status_code == 204

    empty_list = await client.get("/v1/admin/promo-messages", headers=headers)
    assert empty_list.json() == []


@pytest.mark.asyncio
async def test_reorder_promo_messages_sets_sort_order(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)

    message_ids = []
    for i in range(3):
        response = await _create_message(client, headers, f"Сообщение {i}")
        message_ids.append(response.json()["id"])

    reversed_order = list(reversed(message_ids))
    reorder_response = await client.patch(
        "/v1/admin/promo-messages/reorder",
        json={"promo_message_ids": reversed_order},
        headers=headers,
    )

    assert reorder_response.status_code == 200
    body = reorder_response.json()
    assert [m["id"] for m in body] == reversed_order
    assert [m["sort_order"] for m in body] == [0, 1, 2]

    public_list = await client.get("/v1/promo-messages")
    assert [m["id"] for m in public_list.json()] == reversed_order


@pytest.mark.asyncio
async def test_reorder_rejects_mismatched_promo_message_ids(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    await _create_message(client, headers, "Сообщение")

    response = await client.patch(
        "/v1/admin/promo-messages/reorder",
        json={"promo_message_ids": [str(uuid.uuid4())]},
        headers=headers,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "PROMO_MESSAGE_REORDER_MISMATCH"


@pytest.mark.asyncio
async def test_public_promo_messages_ordered_and_only_active(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    first = await _create_message(client, headers, "Первое")
    second = await _create_message(client, headers, "Второе")
    assert first.status_code == 201 and second.status_code == 201

    await client.patch(
        f"/v1/admin/promo-messages/{second.json()['id']}",
        json={"is_active": False},
        headers=headers,
    )

    response = await client.get("/v1/promo-messages")
    assert response.status_code == 200
    body = response.json()
    assert [m["message"] for m in body] == ["Первое"]
    assert "is_active" not in body[0]


@pytest.mark.asyncio
async def test_promo_message_not_found(client: httpx.AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(db_session)

    response = await client.patch(
        f"/v1/admin/promo-messages/{uuid.uuid4()}",
        json={"message": "X"},
        headers=headers,
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROMO_MESSAGE_NOT_FOUND"
