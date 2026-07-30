from fastapi import FastAPI

from app.core.logging import configure_logging
from app.exceptions import register_exception_handlers
from app.middleware import RequestIDMiddleware

configure_logging()

app = FastAPI(title="HobbyLife API")
app.add_middleware(RequestIDMiddleware)
register_exception_handlers(app)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
