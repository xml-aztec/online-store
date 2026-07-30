import pytest
import structlog
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from structlog.testing import capture_logs

from app.middleware import RequestIDMiddleware


def _build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware)

    @app.get("/ping")
    async def ping() -> dict[str, str]:
        return {"ping": "pong"}

    return app


@pytest.mark.asyncio
async def test_request_id_header_and_log() -> None:
    transport = ASGITransport(app=_build_app())

    with capture_logs(processors=[structlog.contextvars.merge_contextvars]) as captured:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/ping")

    assert response.status_code == 200
    assert "x-request-id" in response.headers

    finished = [entry for entry in captured if entry["event"] == "request_finished"]
    assert len(finished) == 1
    assert finished[0]["request_id"] == response.headers["x-request-id"]
    assert finished[0]["status_code"] == 200
