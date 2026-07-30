from fastapi import FastAPI

from app.auth.router import router as auth_router
from app.core.logging import configure_logging
from app.exceptions import register_exception_handlers
from app.middleware import RequestIDMiddleware

configure_logging()

app = FastAPI(title="HobbyLife API")
app.add_middleware(RequestIDMiddleware)
register_exception_handlers(app)

# Caddy strips the "/api" prefix before forwarding here (see caddy/Caddyfile), so
# external "/api/v1/..." reaches this app as "/v1/...".
app.include_router(auth_router, prefix="/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
