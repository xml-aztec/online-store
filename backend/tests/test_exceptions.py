import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient

from app.exceptions import DomainError, register_exception_handlers


def _build_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/domain-error")
    async def raise_domain_error() -> None:
        raise DomainError(
            "Товара нет в наличии",
            code="OUT_OF_STOCK",
            status_code=409,
            details={"available_qty": 0},
        )

    @app.get("/http-error")
    async def raise_http_error() -> None:
        raise HTTPException(status_code=404, detail="Не найдено")

    @app.get("/validate")
    async def validate(qty: int) -> dict[str, int]:
        return {"qty": qty}

    return app


@pytest.mark.asyncio
async def test_domain_error_envelope() -> None:
    transport = ASGITransport(app=_build_app())
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/domain-error")

    assert response.status_code == 409
    assert response.json() == {
        "error": {
            "code": "OUT_OF_STOCK",
            "message": "Товара нет в наличии",
            "details": {"available_qty": 0},
        }
    }


@pytest.mark.asyncio
async def test_http_exception_envelope() -> None:
    transport = ASGITransport(app=_build_app())
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/http-error")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "HTTP_404", "message": "Не найдено", "details": {}}
    }


@pytest.mark.asyncio
async def test_validation_error_envelope() -> None:
    transport = ASGITransport(app=_build_app())
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/validate")

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "errors" in body["error"]["details"]
