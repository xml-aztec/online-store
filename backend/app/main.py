from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.account.router import router as account_router
from app.admin.imports_router import router as admin_imports_router
from app.admin.orders_router import router as admin_orders_router
from app.admin.promo_codes_router import router as admin_promo_codes_router
from app.admin.router import router as admin_router
from app.admin.users_router import router as admin_users_router
from app.auth.router import router as auth_router
from app.cart.router import router as cart_router
from app.catalog.router import router as catalog_router
from app.config import settings
from app.core.logging import configure_logging
from app.exceptions import register_exception_handlers
from app.middleware import RequestIDMiddleware
from app.orders.router import router as orders_router
from app.payments.router import router as payments_router

configure_logging()

app = FastAPI(title="HobbyLife API")
# ТЗ 8: CORS restricted to the frontend's own origin(s), not "*" -- credentials
# (the refresh-token cookie) can't be combined with a wildcard origin anyway.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
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
app.include_router(admin_imports_router, prefix="/v1")
app.include_router(admin_promo_codes_router, prefix="/v1")
app.include_router(admin_users_router, prefix="/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
