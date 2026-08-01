import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.core.security import create_access_token
from app.orders.models import PromoCode


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


async def _make_user(session: AsyncSession, *, role: str) -> User:
    user = User(email=f"{role}-{uuid.uuid4().hex[:10]}@example.com", role=role)
    session.add(user)
    await session.flush()
    return user


async def _admin_headers(session: AsyncSession) -> dict[str, str]:
    user = await _make_user(session, role="admin")
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


def _create_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "code": _slug("promo").upper(),
        "discount_type": "percent",
        "discount_value": "10.00",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_promo_codes_require_admin_role(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    manager = await _make_user(db_session, role="manager")
    headers = {"Authorization": f"Bearer {create_access_token(manager.id, manager.role)}"}

    no_auth = await client.get("/v1/admin/promo-codes")
    assert no_auth.status_code == 401

    wrong_role = await client.get("/v1/admin/promo-codes", headers=headers)
    assert wrong_role.status_code == 403


@pytest.mark.asyncio
async def test_create_promo_code_uppercases_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)

    response = await client.post(
        "/v1/admin/promo-codes",
        json=_create_payload(code=_slug("promo").lower()),
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["code"] == body["code"].upper()
    assert body["used_count"] == 0
    assert body["is_active"] is True


@pytest.mark.asyncio
async def test_create_promo_code_rejects_duplicate_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    code = _slug("promo").upper()

    first = await client.post(
        "/v1/admin/promo-codes", json=_create_payload(code=code), headers=headers
    )
    assert first.status_code == 201

    second = await client.post(
        "/v1/admin/promo-codes", json=_create_payload(code=code.lower()), headers=headers
    )

    assert second.status_code == 409
    assert second.json()["error"]["code"] == "PROMO_CODE_EXISTS"


@pytest.mark.asyncio
async def test_create_promo_code_rejects_non_positive_discount(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)

    response = await client.post(
        "/v1/admin/promo-codes",
        json=_create_payload(discount_value="0.00"),
        headers=headers,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_promo_code_rejects_percent_over_100(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)

    response = await client.post(
        "/v1/admin/promo-codes",
        json=_create_payload(discount_type="percent", discount_value="150.00"),
        headers=headers,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "PROMO_CODE_INVALID_DISCOUNT_VALUE"


@pytest.mark.asyncio
async def test_list_and_get_promo_code(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(db_session)
    created = await client.post(
        "/v1/admin/promo-codes", json=_create_payload(), headers=headers
    )
    promo_id = created.json()["id"]

    list_response = await client.get("/v1/admin/promo-codes", headers=headers)
    assert list_response.status_code == 200
    assert any(item["id"] == promo_id for item in list_response.json()["items"])

    get_response = await client.get(f"/v1/admin/promo-codes/{promo_id}", headers=headers)
    assert get_response.status_code == 200
    assert get_response.json()["id"] == promo_id


@pytest.mark.asyncio
async def test_get_promo_code_not_found(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(db_session)

    response = await client.get(f"/v1/admin/promo-codes/{uuid.uuid4()}", headers=headers)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROMO_CODE_NOT_FOUND"


@pytest.mark.asyncio
async def test_update_promo_code_fields(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(db_session)
    created = await client.post(
        "/v1/admin/promo-codes", json=_create_payload(), headers=headers
    )
    promo_id = created.json()["id"]

    response = await client.patch(
        f"/v1/admin/promo-codes/{promo_id}",
        json={"discount_value": "25.00", "is_active": False},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["discount_value"] == "25.00"
    assert body["is_active"] is False


@pytest.mark.asyncio
async def test_update_promo_code_rejects_duplicate_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    code_a = _slug("promo").upper()
    code_b = _slug("promo").upper()
    await client.post("/v1/admin/promo-codes", json=_create_payload(code=code_a), headers=headers)
    created_b = await client.post(
        "/v1/admin/promo-codes", json=_create_payload(code=code_b), headers=headers
    )

    response = await client.patch(
        f"/v1/admin/promo-codes/{created_b.json()['id']}",
        json={"code": code_a.lower()},
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROMO_CODE_EXISTS"


@pytest.mark.asyncio
async def test_delete_unused_promo_code(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(db_session)
    created = await client.post(
        "/v1/admin/promo-codes", json=_create_payload(), headers=headers
    )
    promo_id = created.json()["id"]

    response = await client.delete(f"/v1/admin/promo-codes/{promo_id}", headers=headers)

    assert response.status_code == 204
    get_response = await client.get(f"/v1/admin/promo-codes/{promo_id}", headers=headers)
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_delete_used_promo_code_is_blocked(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    promo = PromoCode(
        code=_slug("promo").upper(),
        discount_type="fixed",
        discount_value=Decimal("100.00"),
        used_count=1,
    )
    db_session.add(promo)
    await db_session.commit()

    response = await client.delete(f"/v1/admin/promo-codes/{promo.id}", headers=headers)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROMO_CODE_IN_USE"
