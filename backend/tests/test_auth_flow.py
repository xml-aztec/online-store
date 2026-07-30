import uuid

import pytest
from httpx import AsyncClient

from app.core.queue import get_arq_pool

_PASSWORD = "correct-horse-battery"


def _unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"


async def _get_enqueued_token(function_name: str, user_id: uuid.UUID) -> str:
    pool = await get_arq_pool()
    jobs = await pool.queued_jobs()
    matching = [
        job
        for job in jobs
        if job.function == function_name and job.kwargs.get("user_id") == str(user_id)
    ]
    assert matching, f"No {function_name} job enqueued for user {user_id}"
    token = matching[-1].kwargs["token"]
    assert isinstance(token, str)
    return token


@pytest.mark.asyncio
async def test_full_auth_flow_register_verify_login_refresh_logout(client: AsyncClient) -> None:
    email = _unique_email("flow")

    register_response = await client.post(
        "/v1/auth/register",
        json={"email": email, "password": _PASSWORD, "full_name": "Тестовый Пользователь"},
    )
    assert register_response.status_code == 201
    body = register_response.json()
    assert body["email_verified"] is False
    user_id = uuid.UUID(body["id"])

    verify_token = await _get_enqueued_token("send_verification_email", user_id)
    verify_response = await client.post("/v1/auth/verify-email", json={"token": verify_token})
    assert verify_response.status_code == 200

    login_response = await client.post(
        "/v1/auth/login", json={"email": email, "password": _PASSWORD}
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]
    assert access_token
    assert "refresh_token" in login_response.cookies

    refresh_response = await client.post("/v1/auth/refresh")
    assert refresh_response.status_code == 200
    assert refresh_response.json()["access_token"] != access_token

    logout_response = await client.post("/v1/auth/logout")
    assert logout_response.status_code == 204


@pytest.mark.asyncio
async def test_reusing_rotated_refresh_token_returns_401(client: AsyncClient) -> None:
    email = _unique_email("reuse")
    await client.post(
        "/v1/auth/register", json={"email": email, "password": _PASSWORD, "full_name": None}
    )
    await client.post("/v1/auth/login", json={"email": email, "password": _PASSWORD})

    old_refresh_cookie = client.cookies.get("refresh_token")
    assert old_refresh_cookie is not None

    first_refresh = await client.post("/v1/auth/refresh")
    assert first_refresh.status_code == 200

    reuse_response = await client.post(
        "/v1/auth/refresh", headers={"Cookie": f"refresh_token={old_refresh_cookie}"}
    )
    assert reuse_response.status_code == 401
    assert reuse_response.json()["error"]["code"] == "INVALID_REFRESH_TOKEN"


@pytest.mark.asyncio
async def test_refresh_without_cookie_returns_401(client: AsyncClient) -> None:
    response = await client.post("/v1/auth/refresh")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_register_rejects_duplicate_email(client: AsyncClient) -> None:
    email = _unique_email("dup")
    payload = {"email": email, "password": _PASSWORD, "full_name": None}

    first = await client.post("/v1/auth/register", json=payload)
    assert first.status_code == 201

    second = await client.post("/v1/auth/register", json=payload)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "EMAIL_ALREADY_REGISTERED"


@pytest.mark.asyncio
async def test_register_rejects_short_password(client: AsyncClient) -> None:
    response = await client.post(
        "/v1/auth/register",
        json={"email": _unique_email("short"), "password": "short", "full_name": None},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_rejects_wrong_password(client: AsyncClient) -> None:
    email = _unique_email("wrongpw")
    await client.post(
        "/v1/auth/register", json={"email": email, "password": _PASSWORD, "full_name": None}
    )

    response = await client.post("/v1/auth/login", json={"email": email, "password": "nope1234"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_verify_email_rejects_invalid_token(client: AsyncClient) -> None:
    response = await client.post("/v1/auth/verify-email", json={"token": "not-a-real-token"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_TOKEN"


@pytest.mark.asyncio
async def test_login_rate_limit_returns_429(client: AsyncClient) -> None:
    email = _unique_email("ratelimit")
    await client.post(
        "/v1/auth/register", json={"email": email, "password": _PASSWORD, "full_name": None}
    )

    for _ in range(5):
        response = await client.post(
            "/v1/auth/login", json={"email": email, "password": "wrong-password"}
        )
        assert response.status_code == 401

    limited_response = await client.post(
        "/v1/auth/login", json={"email": email, "password": "wrong-password"}
    )
    assert limited_response.status_code == 429
    assert limited_response.json()["error"]["code"] == "RATE_LIMITED"


@pytest.mark.asyncio
async def test_register_rate_limit_returns_429(client: AsyncClient) -> None:
    for _ in range(3):
        response = await client.post(
            "/v1/auth/register",
            json={"email": _unique_email("reg-rl"), "password": _PASSWORD, "full_name": None},
        )
        assert response.status_code == 201

    limited_response = await client.post(
        "/v1/auth/register",
        json={"email": _unique_email("reg-rl"), "password": _PASSWORD, "full_name": None},
    )
    assert limited_response.status_code == 429
    assert limited_response.json()["error"]["code"] == "RATE_LIMITED"


@pytest.mark.asyncio
async def test_forgot_password_does_not_leak_email_existence(client: AsyncClient) -> None:
    known_email = _unique_email("known")
    await client.post(
        "/v1/auth/register",
        json={"email": known_email, "password": _PASSWORD, "full_name": None},
    )

    response_known = await client.post("/v1/auth/forgot-password", json={"email": known_email})
    response_unknown = await client.post(
        "/v1/auth/forgot-password", json={"email": _unique_email("unknown")}
    )

    assert response_known.status_code == 200
    assert response_unknown.status_code == 200
    assert response_known.json() == response_unknown.json()


@pytest.mark.asyncio
async def test_reset_password_flow_and_one_time_use(client: AsyncClient) -> None:
    email = _unique_email("reset")
    new_password = "new-correct-horse-battery"

    register_response = await client.post(
        "/v1/auth/register", json={"email": email, "password": _PASSWORD, "full_name": None}
    )
    user_id = uuid.UUID(register_response.json()["id"])

    await client.post("/v1/auth/forgot-password", json={"email": email})
    reset_token = await _get_enqueued_token("send_password_reset_email", user_id)

    reset_response = await client.post(
        "/v1/auth/reset-password", json={"token": reset_token, "new_password": new_password}
    )
    assert reset_response.status_code == 200

    old_login = await client.post("/v1/auth/login", json={"email": email, "password": _PASSWORD})
    assert old_login.status_code == 401

    new_login = await client.post(
        "/v1/auth/login", json={"email": email, "password": new_password}
    )
    assert new_login.status_code == 200

    reuse_response = await client.post(
        "/v1/auth/reset-password",
        json={"token": reset_token, "new_password": "yet-another-password"},
    )
    assert reuse_response.status_code == 400
    assert reuse_response.json()["error"]["code"] == "INVALID_TOKEN"
