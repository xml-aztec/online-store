import html
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.models import User
from app.catalog.models import ProductVariant
from app.config import settings
from app.core.redis import get_redis
from app.exceptions import DomainError
from app.orders import service as orders_service
from app.orders.models import Order
from app.telegram import bot_api
from app.telegram.schemas import TelegramCallbackQuery

logger = structlog.get_logger()

_LINK_TOKEN_PREFIX = "telegram_link:"
_LINK_TOKEN_TTL_SECONDS = 10 * 60

_UPDATE_DEDUP_PREFIX = "telegram_update:"
_UPDATE_DEDUP_TTL_SECONDS = 24 * 60 * 60

# Hash {chat_id: message_id} per order -- lets notify_status_change find and
# edit every recipient's original "new order" message instead of posting a
# fresh one each time the status changes (ТЗ 5.6).
_ORDER_MESSAGES_PREFIX = "telegram_order_msgs:"
_ORDER_MESSAGES_TTL_SECONDS = 30 * 24 * 60 * 60

_LOW_STOCK_DEDUP_PREFIX = "telegram_low_stock:"
_LOW_STOCK_DEDUP_TTL_SECONDS = 24 * 60 * 60

# callback_data must fit Telegram's 64-byte limit -- "os:" + a 32-char hex
# UUID + ":" + the longest status name ("awaiting_payment") is 52 bytes, well
# under, whereas the obvious "order_status:{uuid-with-dashes}:{status}" spelling
# would be 66 and get silently rejected by sendMessage/editMessageText.
_CALLBACK_PREFIX = "os"

# Bishkek (Asia/Bishkek) is UTC+6 year-round -- no DST to account for.
_BISHKEK_UTC_OFFSET_HOURS = 6

_STATUS_LABELS = {
    "pending": "Ожидает подтверждения",
    "awaiting_payment": "Ожидает оплаты",
    "paid": "Оплачен",
    "processing": "Собирается",
    "shipped": "Отправлен",
    "delivered": "Доставлен",
    "cancelled": "Отменён",
    "refunded": "Возврат оформлен",
}
_PAYMENT_METHOD_LABELS = {"cash_on_delivery": "наличными при получении", "online": "онлайн"}
_DELIVERY_METHOD_LABELS = {"pickup": "самовывоз", "courier": "курьер"}

# Reply-keyboard button labels sent after handle_start (ТЗ 5.6 update). Telegram
# delivers a tap on these back to the webhook as a plain text message with this
# exact text -- no callback_query involved -- so they must stay in sync with
# _main_menu_keyboard() below.
_ORDERS_MENU_TEXT = "📦 Заказы"
_STATS_MENU_TEXT = "📊 Статистика"

_ORDERS_LIST_PREFIX = "orders_list"
_ORDER_VIEW_PREFIX = "order_view"
_STATS_PREFIX = "stats"
_ORDERS_PAGE_SIZE = 8

# (key, label, status_filter) -- `None` for "all" means no status filter at
# all, matching list_orders_admin's own `if status_filter:` truthiness check.
_ORDER_FILTER_PRESETS: list[tuple[str, str, list[str] | None]] = [
    ("all", "Все", None),
    ("new", "Новые", ["pending"]),
    ("awaiting_payment", "Ожидают оплаты", ["awaiting_payment"]),
    ("processing", "В сборке", ["processing"]),
    ("cancelled", "Отменённые", ["cancelled"]),
    ("refunded", "Возвраты", ["refunded"]),
]
_ORDER_FILTER_STATUSES: dict[str, list[str] | None] = {
    key: statuses for key, _label, statuses in _ORDER_FILTER_PRESETS
}
_ORDER_FILTER_LABELS: dict[str, str] = {
    key: label for key, label, _statuses in _ORDER_FILTER_PRESETS
}

_STATS_PERIOD_LABELS: dict[str, str] = {"today": "Сегодня", "7d": "7 дней", "30d": "30 дней"}

_NOT_LINKED_MESSAGE = "Этот аккаунт не привязан."
_INSUFFICIENT_ROLE_MESSAGE = "Недостаточно прав."


def _format_money(amount: Decimal) -> str:
    # Mirrors frontend/src/shared/lib/formatPrice.ts: "1 250 сом", cents shown
    # only when actually present -- Telegram messages are plain text with no
    # frontend to apply that formatting for us.
    has_fraction = (amount * 100) % 100 != 0
    quantized = amount.quantize(Decimal("0.01") if has_fraction else Decimal("1"))
    return f"{format(quantized, ',').replace(',', ' ')} сом"


def _bishkek_day_start(now: datetime) -> datetime:
    offset = timedelta(hours=_BISHKEK_UTC_OFFSET_HOURS)
    local = now + offset
    local_midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return local_midnight - offset


async def _notification_recipients(session: AsyncSession) -> list[str]:
    """chat_ids of every active manager/admin with Telegram linked.

    ТЗ 5.6: notifications must never reach a `customer`, even if
    telegram_chat_id were somehow set on one -- this role filter is the single
    choke point every notify_* function below funnels through.
    """
    rows = await session.scalars(
        select(User.telegram_chat_id).where(
            User.role.in_(("manager", "admin")),
            User.telegram_chat_id.isnot(None),
            User.is_active.is_(True),
        )
    )
    return [chat_id for chat_id in rows if chat_id]


async def _safe_send(
    chat_id: str, text: str, *, reply_markup: dict[str, Any] | None = None
) -> int | None:
    try:
        return await bot_api.send_message(chat_id, text, reply_markup=reply_markup)
    except bot_api.TelegramApiError:
        # One manager blocking the bot (or an unreachable chat) must not stop
        # the rest of the fan-out below.
        logger.warning("telegram_send_failed", chat_id=chat_id)
        return None


def _order_keyboard(order: Order) -> dict[str, Any] | None:
    targets = orders_service.manually_allowed_transitions(order.status)
    if not targets:
        return None
    return bot_api.inline_keyboard(
        [
            [(_STATUS_LABELS.get(to, to), f"{_CALLBACK_PREFIX}:{order.id.hex}:{to}")]
            for to in targets
        ]
    )


def _main_menu_keyboard() -> dict[str, Any]:
    return bot_api.reply_keyboard([[_ORDERS_MENU_TEXT, _STATS_MENU_TEXT]])


def _order_filters_keyboard() -> dict[str, Any]:
    return bot_api.inline_keyboard(
        [
            [(label, f"{_ORDERS_LIST_PREFIX}:{key}:0")]
            for key, label, _statuses in _ORDER_FILTER_PRESETS
        ]
    )


def _stats_period_keyboard() -> dict[str, Any]:
    return bot_api.inline_keyboard(
        [[(label, f"{_STATS_PREFIX}:{key}") for key, label in _STATS_PERIOD_LABELS.items()]]
    )


async def _authorize_chat(session: AsyncSession, chat_id: str) -> tuple[User | None, str | None]:
    """Single choke point for every entry point added by the ТЗ 5.6 update --
    the reply-keyboard text handlers and the orders_list/order_view/stats
    callbacks all funnel through this before touching any order/revenue data.
    Distinguishes "not linked" from "linked but role too low" so callers can
    show the right one of the two polite messages instead of a generic one.
    """
    linked = await session.scalar(select(User).where(User.telegram_chat_id == chat_id))
    if linked is None:
        return None, _NOT_LINKED_MESSAGE
    if linked.role not in ("manager", "admin"):
        return None, _INSUFFICIENT_ROLE_MESSAGE
    return linked, None


def _format_order_message(order: Order) -> str:
    lines = [
        f"<b>Заказ {html.escape(order.number)}</b>",
        f"Статус: {_STATUS_LABELS.get(order.status, order.status)}",
        "",
    ]
    for item in order.items:
        options = ", ".join(str(value) for value in item.variant_options.values())
        suffix = f" ({html.escape(options)})" if options else ""
        lines.append(f"• {html.escape(item.product_name)}{suffix} × {item.quantity}")
    lines.append("")
    lines.append(f"Сумма: {_format_money(order.total)}")
    lines.append(
        f"Оплата: {_PAYMENT_METHOD_LABELS.get(order.payment_method, order.payment_method)}"
    )
    lines.append(
        f"Доставка: {_DELIVERY_METHOD_LABELS.get(order.delivery_method, order.delivery_method)}"
    )
    if order.comment:
        lines.append(f"Комментарий: {html.escape(order.comment)}")
    return "\n".join(lines)


async def _render_orders_list(
    session: AsyncSession, *, filter_key: str, page: int
) -> tuple[str, dict[str, Any]]:
    orders, total = await orders_service.list_orders_admin(
        session,
        status_filter=_ORDER_FILTER_STATUSES[filter_key],
        date_from=None,
        date_to=None,
        search=None,
        page=page + 1,  # list_orders_admin pages from 1; our callback_data pages from 0
        page_size=_ORDERS_PAGE_SIZE,
    )

    label = _ORDER_FILTER_LABELS[filter_key]
    header = f"<b>Заказы: {html.escape(label)}</b> (всего: {total})"
    text = header if orders else f"{header}\n\nНичего не найдено."

    rows: list[list[tuple[str, str]]] = [
        [
            (
                f"№{order.number} · {_format_money(order.total)} · "
                f"{_STATUS_LABELS.get(order.status, order.status)}",
                f"{_ORDER_VIEW_PREFIX}:{order.id.hex}",
            )
        ]
        for order in orders
    ]
    nav: list[tuple[str, str]] = []
    if page > 0:
        nav.append(("⬅️ Назад", f"{_ORDERS_LIST_PREFIX}:{filter_key}:{page - 1}"))
    if (page + 1) * _ORDERS_PAGE_SIZE < total:
        nav.append(("Следующие ➡️", f"{_ORDERS_LIST_PREFIX}:{filter_key}:{page + 1}"))
    if nav:
        rows.append(nav)

    return text, bot_api.inline_keyboard(rows)


def _stats_period_bounds(period: str, *, now: datetime) -> tuple[datetime, datetime]:
    if period == "today":
        return _bishkek_day_start(now), now
    if period == "7d":
        return now - timedelta(days=7), now
    return now - timedelta(days=30), now  # "30d", the only remaining valid key


def _format_stats_digest(title: str, stats: orders_service.DailyDigestStats) -> str:
    lines = [
        f"<b>{title}</b>",
        "",
        f"Заказов: {stats.orders_count}",
        f"Выручка: {_format_money(stats.revenue)}",
    ]
    if stats.top_products:
        lines.append("")
        lines.append("Топ-3 товара:")
        for index, product in enumerate(stats.top_products, start=1):
            lines.append(
                f"{index}. {html.escape(product.product_name)} — {product.quantity_sold} шт."
            )
    return "\n".join(lines)


async def create_link_token(user_id: uuid.UUID) -> str:
    token = secrets.token_urlsafe(24)
    redis = get_redis()
    await redis.set(f"{_LINK_TOKEN_PREFIX}{token}", str(user_id), ex=_LINK_TOKEN_TTL_SECONDS)
    return f"https://t.me/{settings.telegram_bot_username}?start={token}"


async def handle_start(session: AsyncSession, *, token: str, chat_id: str) -> None:
    redis = get_redis()
    key = f"{_LINK_TOKEN_PREFIX}{token}"
    user_id_raw = await redis.get(key)
    if user_id_raw is None:
        await _safe_send(
            chat_id,
            "Ссылка устарела или недействительна. Запросите новую ссылку в админ-панели HobbyLife.",
        )
        return
    # One-time use -- burn the token regardless of what happens next below.
    await redis.delete(key)

    user = await session.get(User, uuid.UUID(user_id_raw))
    if user is None or user.role not in ("manager", "admin"):
        await _safe_send(chat_id, "Аккаунт не найден.")
        return

    user.telegram_chat_id = chat_id
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        await _safe_send(
            chat_id, "Этот Telegram-аккаунт уже привязан к другому пользователю HobbyLife."
        )
        return

    await _safe_send(
        chat_id,
        f"Готово, {html.escape(user.full_name or user.email)}! "
        "Уведомления о заказах и остатках будут приходить сюда.",
        reply_markup=_main_menu_keyboard(),
    )


async def notify_new_order(session: AsyncSession, order: Order) -> None:
    recipients = await _notification_recipients(session)
    if not recipients:
        return

    text = _format_order_message(order)
    keyboard = _order_keyboard(order)

    redis = get_redis()
    message_map_key = f"{_ORDER_MESSAGES_PREFIX}{order.id}"
    for chat_id in recipients:
        message_id = await _safe_send(chat_id, text, reply_markup=keyboard)
        if message_id is not None:
            # redis-py types async hset/hgetall as `Awaitable[T] | T`, a stub gap
            # shared by a handful of hash commands -- see the fuller writeup at
            # app/cart/service.py's _hset/_hgetall, which has the same workaround.
            await redis.hset(message_map_key, chat_id, str(message_id))  # type: ignore[misc]
    await redis.expire(message_map_key, _ORDER_MESSAGES_TTL_SECONDS)


async def notify_status_change(session: AsyncSession, order: Order) -> None:
    redis = get_redis()
    message_map_key = f"{_ORDER_MESSAGES_PREFIX}{order.id}"
    tracked: dict[str, str] = await redis.hgetall(message_map_key)  # type: ignore[misc]
    if not tracked:
        # No "new order" message was ever sent for this order (e.g. every
        # manager linked Telegram after it was created) -- nothing to edit.
        return

    text = _format_order_message(order)
    keyboard = _order_keyboard(order)
    for chat_id, message_id in tracked.items():
        try:
            await bot_api.edit_message_text(chat_id, int(message_id), text, reply_markup=keyboard)
        except bot_api.TelegramApiError:
            logger.warning("telegram_edit_message_failed", chat_id=chat_id, order_id=str(order.id))


async def notify_low_stock(session: AsyncSession, variant: ProductVariant) -> None:
    # ТЗ 5.6: at most one low-stock alert per variant per 24h.
    redis = get_redis()
    dedup_key = f"{_LOW_STOCK_DEDUP_PREFIX}{variant.id}"
    if not await redis.set(dedup_key, "1", nx=True, ex=_LOW_STOCK_DEDUP_TTL_SECONDS):
        return

    recipients = await _notification_recipients(session)
    if not recipients:
        return

    options = ", ".join(str(value) for value in variant.options.values())
    suffix = f" ({html.escape(options)})" if options else ""
    product_name = variant.product.name if variant.product is not None else variant.sku
    text = (
        f"⚠️ Заканчивается остаток: {html.escape(product_name)}{suffix}\n"
        f"SKU {html.escape(variant.sku)} — осталось {variant.stock_qty} шт."
    )
    for chat_id in recipients:
        await _safe_send(chat_id, text)


async def send_daily_digest(session: AsyncSession) -> None:
    recipients = await _notification_recipients(session)
    if not recipients:
        return

    now = datetime.now(UTC)
    since = _bishkek_day_start(now)
    stats = await orders_service.get_daily_digest_stats(session, since=since, until=now)
    text = _format_stats_digest(f"Итоги дня — {since.strftime('%d.%m.%Y')}", stats)

    for chat_id in recipients:
        await _safe_send(chat_id, text)


async def handle_text_message(session: AsyncSession, *, chat_id: str, text: str) -> None:
    """Dispatches a reply-keyboard button press (ТЗ 5.6 update) -- Telegram
    delivers a tap on those as a plain text message, not a callback_query.
    Unrecognized text (regular chat messages, anything else) is silently
    ignored, same as every non-/start message was before this feature existed.
    """
    if text == _ORDERS_MENU_TEXT:
        await _handle_orders_menu_text(session, chat_id=chat_id)
    elif text == _STATS_MENU_TEXT:
        await _handle_stats_menu_text(session, chat_id=chat_id)


async def _handle_orders_menu_text(session: AsyncSession, *, chat_id: str) -> None:
    user, unauthorized_reason = await _authorize_chat(session, chat_id)
    if user is None:
        assert unauthorized_reason is not None
        await _safe_send(chat_id, unauthorized_reason)
        return
    await _safe_send(chat_id, "Выберите фильтр:", reply_markup=_order_filters_keyboard())


async def _handle_stats_menu_text(session: AsyncSession, *, chat_id: str) -> None:
    user, unauthorized_reason = await _authorize_chat(session, chat_id)
    if user is None:
        assert unauthorized_reason is not None
        await _safe_send(chat_id, unauthorized_reason)
        return
    await _safe_send(chat_id, "Выберите период:", reply_markup=_stats_period_keyboard())


def _parse_callback_data(data: str) -> tuple[uuid.UUID, str] | None:
    parts = data.split(":")
    if len(parts) != 3 or parts[0] != _CALLBACK_PREFIX:
        return None
    try:
        order_id = uuid.UUID(hex=parts[1])
    except ValueError:
        return None
    return order_id, parts[2]


async def handle_callback(
    session: AsyncSession, *, update_id: int, callback_query: TelegramCallbackQuery
) -> None:
    # ТЗ 5.6 step 2: Telegram may redeliver the same update -- do nothing the
    # second time, but still ack it below so Telegram stops retrying.
    redis = get_redis()
    dedup_key = f"{_UPDATE_DEDUP_PREFIX}{update_id}"
    is_new = await redis.set(dedup_key, "1", nx=True, ex=_UPDATE_DEDUP_TTL_SECONDS)
    if not is_new:
        logger.info("telegram_update_duplicate_ignored", update_id=update_id)
        return

    # Single choke point for every callback_query this bot handles -- the
    # original order-status buttons (`os:...`) and the orders_list/order_view/
    # stats callbacks added by the ТЗ 5.6 update all funnel through the same
    # check before any of them is dispatched below.
    chat_id = str(callback_query.from_.id)
    user, unauthorized_reason = await _authorize_chat(session, chat_id)
    if user is None:
        await bot_api.answer_callback_query(
            callback_query.id, text=unauthorized_reason, show_alert=True
        )
        return

    data = callback_query.data or ""
    prefix = data.split(":", 1)[0]

    if prefix == _CALLBACK_PREFIX:
        await _handle_status_change_callback(
            session, user=user, callback_query=callback_query, data=data
        )
    elif prefix == _ORDERS_LIST_PREFIX:
        await _handle_orders_list_callback(session, callback_query=callback_query, data=data)
    elif prefix == _ORDER_VIEW_PREFIX:
        await _handle_order_view_callback(session, callback_query=callback_query, data=data)
    elif prefix == _STATS_PREFIX:
        await _handle_stats_callback(session, callback_query=callback_query, data=data)
    else:
        await bot_api.answer_callback_query(callback_query.id, text="Неизвестное действие.")


async def _handle_status_change_callback(
    session: AsyncSession, *, user: User, callback_query: TelegramCallbackQuery, data: str
) -> None:
    parsed = _parse_callback_data(data)
    if parsed is None:
        await bot_api.answer_callback_query(callback_query.id, text="Неизвестное действие.")
        return
    order_id, to_status = parsed

    order = await session.scalar(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )
    if order is None:
        await bot_api.answer_callback_query(callback_query.id, text="Заказ не найден.")
        return

    try:
        # Same call the REST endpoint (POST /admin/orders/{id}/status) makes --
        # no second copy of the transition/stock-restore/audit-log logic here.
        await orders_service.transition_status(
            session,
            order,
            to_status=to_status,
            changed_by=user.id,
            comment="Изменено через Telegram-бот",
        )
    except DomainError as exc:
        await bot_api.answer_callback_query(callback_query.id, text=exc.message, show_alert=True)
        return

    # transition_status already enqueues send_telegram_status_change, which
    # edits every recipient's copy of this order's message (including this
    # presser's) -- just close the button's loading spinner here.
    await bot_api.answer_callback_query(callback_query.id, text="Готово")


async def _handle_orders_list_callback(
    session: AsyncSession, *, callback_query: TelegramCallbackQuery, data: str
) -> None:
    parts = data.split(":")
    filter_key = parts[1] if len(parts) == 3 else ""
    if filter_key not in _ORDER_FILTER_STATUSES:
        await bot_api.answer_callback_query(callback_query.id, text="Неизвестный фильтр.")
        return
    try:
        page = max(int(parts[2]), 0)
    except ValueError:
        await bot_api.answer_callback_query(callback_query.id, text="Неизвестная страница.")
        return

    message = callback_query.message
    if message is None:
        await bot_api.answer_callback_query(callback_query.id)
        return

    text, keyboard = await _render_orders_list(session, filter_key=filter_key, page=page)
    try:
        await bot_api.edit_message_text(
            str(message.chat.id), message.message_id, text, reply_markup=keyboard
        )
    except bot_api.TelegramApiError:
        logger.warning("telegram_edit_message_failed", chat_id=str(message.chat.id))
    await bot_api.answer_callback_query(callback_query.id)


async def _handle_order_view_callback(
    session: AsyncSession, *, callback_query: TelegramCallbackQuery, data: str
) -> None:
    _, _sep, order_id_hex = data.partition(":")
    try:
        order_id = uuid.UUID(hex=order_id_hex)
    except ValueError:
        await bot_api.answer_callback_query(callback_query.id, text="Неизвестный заказ.")
        return

    order = await session.scalar(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )
    if order is None:
        await bot_api.answer_callback_query(callback_query.id, text="Заказ не найден.")
        return

    message = callback_query.message
    if message is None:
        await bot_api.answer_callback_query(callback_query.id)
        return

    # Same card renderer notify_new_order/notify_status_change use for the
    # pushed version -- ТЗ 5.6 update explicitly forbids a second, slightly
    # different variant here.
    try:
        await bot_api.edit_message_text(
            str(message.chat.id),
            message.message_id,
            _format_order_message(order),
            reply_markup=_order_keyboard(order),
        )
    except bot_api.TelegramApiError:
        logger.warning("telegram_edit_message_failed", chat_id=str(message.chat.id))
    await bot_api.answer_callback_query(callback_query.id)


async def _handle_stats_callback(
    session: AsyncSession, *, callback_query: TelegramCallbackQuery, data: str
) -> None:
    _, _sep, period = data.partition(":")
    if period not in _STATS_PERIOD_LABELS:
        await bot_api.answer_callback_query(callback_query.id, text="Неизвестный период.")
        return

    message = callback_query.message
    if message is None:
        await bot_api.answer_callback_query(callback_query.id)
        return

    since, until = _stats_period_bounds(period, now=datetime.now(UTC))
    stats = await orders_service.get_daily_digest_stats(session, since=since, until=until)
    text = _format_stats_digest(f"Статистика — {_STATS_PERIOD_LABELS[period]}", stats)
    await _safe_send(str(message.chat.id), text)
    await bot_api.answer_callback_query(callback_query.id)
