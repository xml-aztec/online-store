import httpx
import pytest


@pytest.mark.asyncio
async def test_cors_allows_configured_frontend_origin(client: httpx.AsyncClient) -> None:
    # ТЗ 8: CORS restricted to the frontend's own origin (settings.CORS_ORIGINS
    # in the test/dev env is "http://localhost").
    response = await client.get("/health", headers={"Origin": "http://localhost"})

    assert response.headers.get("access-control-allow-origin") == "http://localhost"
    assert response.headers.get("access-control-allow-credentials") == "true"


@pytest.mark.asyncio
async def test_cors_rejects_unlisted_origin(client: httpx.AsyncClient) -> None:
    response = await client.get("/health", headers={"Origin": "http://evil.example"})

    assert "access-control-allow-origin" not in response.headers
