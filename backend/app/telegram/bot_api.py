from typing import Any

import httpx
import structlog

from app.config import settings

logger = structlog.get_logger()

_API_BASE = "https://api.telegram.org"
_TIMEOUT = 10.0


class TelegramApiError(Exception):
    """Raised when the Bot API returns ok=false or a transport error occurs."""


def _method_url(method: str) -> str:
    return f"{_API_BASE}/bot{settings.telegram_bot_token}/{method}"


async def _call(method: str, payload: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            response = await client.post(_method_url(method), json=payload)
        except httpx.HTTPError as exc:
            raise TelegramApiError(f"{method}: transport error") from exc

    body: dict[str, Any] = response.json()
    if not body.get("ok"):
        raise TelegramApiError(f"{method}: {body.get('description', 'unknown error')}")
    result: dict[str, Any] = body["result"]
    return result


def inline_keyboard(rows: list[list[tuple[str, str]]]) -> dict[str, Any]:
    """Builds a Telegram InlineKeyboardMarkup from rows of (label, callback_data)."""
    return {
        "inline_keyboard": [
            [{"text": label, "callback_data": callback_data} for label, callback_data in row]
            for row in rows
        ]
    }


async def send_message(
    chat_id: str, text: str, *, reply_markup: dict[str, Any] | None = None
) -> int:
    """Sends a message, returns its message_id (needed later by edit_message_text)."""
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    result = await _call("sendMessage", payload)
    return int(result["message_id"])


async def edit_message_text(
    chat_id: str, message_id: int, text: str, *, reply_markup: dict[str, Any] | None = None
) -> None:
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "message_id": message_id,
        "text": text,
        "parse_mode": "HTML",
        # Telegram requires an *empty* keyboard object (not an absent field) to
        # actually remove the buttons from a message that had them -- omitting
        # the key just leaves the previous keyboard in place.
        "reply_markup": reply_markup if reply_markup is not None else {"inline_keyboard": []},
    }
    await _call("editMessageText", payload)


async def answer_callback_query(
    callback_query_id: str, *, text: str | None = None, show_alert: bool = False
) -> None:
    payload: dict[str, Any] = {"callback_query_id": callback_query_id, "show_alert": show_alert}
    if text is not None:
        payload["text"] = text
    await _call("answerCallbackQuery", payload)


async def set_webhook(url: str, *, secret_token: str) -> None:
    await _call("setWebhook", {"url": url, "secret_token": secret_token})
