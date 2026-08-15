from pathlib import Path
from typing import Any

import httpx
import structlog
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import settings

logger = structlog.get_logger()

_RESEND_API_URL = "https://api.resend.com/emails"

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates" / "emails"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
)


def render_email_template(template_name: str, **context: Any) -> str:
    return _env.get_template(template_name).render(**context)


async def send_email(to: str, subject: str, html: str) -> None:
    """Best-effort, single-attempt send via the Resend REST API.

    Unlike a payment webhook, a lost transactional email doesn't need
    idempotent retries -- a failure (non-2xx response or a transport error)
    is logged at error level and swallowed here, so it never takes down the
    arq task that triggered it.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                _RESEND_API_URL,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={"from": settings.email_from, "to": [to], "subject": subject, "html": html},
            )
    except httpx.HTTPError as exc:
        logger.error("resend_send_failed", to=to, subject=subject, error=str(exc))
        return

    if response.status_code >= 300:
        logger.error(
            "resend_send_failed",
            to=to,
            subject=subject,
            status_code=response.status_code,
            response_body=response.text,
        )
