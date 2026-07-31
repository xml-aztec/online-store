from fastapi import FastAPI

from app.account.router import router as account_router
from app.admin.orders_router import router as admin_orders_router
from app.admin.router import router as admin_router
from app.auth.router import router as auth_router
from app.cart.router import router as cart_router
from app.catalog.router import router as catalog_router
from app.core.logging import configure_logging
from app.exceptions import register_exception_handlers
from app.middleware import RequestIDMiddleware
from app.orders.router import router as orders_router
from app.payments.router import router as payments_router

configure_logging()

app = FastAPI(title="HobbyLife API")
app.add_middleware(RequestIDMiddleware)
register_exception_handlers(app)

# Caddy strips the "/api" prefix before forwarding here (see caddy/Caddyfile), so
# external "/api/v1/..." reaches this app as "/v1/...".
app.include_router(auth_router, prefix="/v1")
app.include_router(account_router, prefix="/v1")
app.include_router(cart_router, prefix="/v1")
app.include_router(orders_router, prefix="/v1")
app.include_router(payments_router, prefix="/v1")
app.include_router(catalog_router, prefix="/v1")
app.include_router(admin_router, prefix="/v1")
app.include_router(admin_orders_router, prefix="/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
