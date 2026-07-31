import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any, cast

from sqlalchemy import ColumnElement, func, or_, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.cart import service as cart_service
from app.catalog.models import ProductVariant
from app.config import settings
from app.core.queue import get_arq_pool
from app.core.redis import get_redis
from app.exceptions import DomainError
from app.orders.models import Order, OrderItem, OrderStatusHistory, PromoCode
from app.payments.models import Payment
from app.payments.providers.registry import get_default_provider

# ТЗ 5.1: allowed transitions; everything else is a 409.
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"awaiting_payment", "cancelled"},
    "awaiting_payment": {"paid", "cancelled"},
    "paid": {"processing", "refunded"},
    "processing": {"shipped", "cancelled"},
    "shipped": {"delivered"},
    "delivered": {"refunded"},
    "cancelled": set(),
    "refunded": set(),
}

_STOCK_RESTORING_STATUSES = {"cancelled", "refunded"}
_NOTIFY_STATUSES = {"paid", "shipped", "cancelled"}
_CUSTOMER_CANCELLABLE_STATUSES = {"pending", "awaiting_payment"}
_ORDER_EXPIRY = timedelta(minutes=30)


async def _generate_order_number() -> str:
    redis = get_redis()
    today = datetime.now(UTC).strftime("%Y%m%d")
    counter_key = f"orders:counter:{today}"
    counter = await redis.incr(counter_key)
    await redis.expire(counter_key, 60 * 60 * 48)
    return f"ORD-{today}-{counter:05d}"


def _compute_delivery_cost(delivery_method: str, subtotal: Decimal) -> Decimal:
    if delivery_method == "pickup":
        return Decimal("0")
    if subtotal >= settings.free_delivery_threshold:
        return Decimal("0")
    return settings.courier_delivery_cost


async def create_order(
    session: AsyncSession,
    *,
    cart_key: str,
    user_id: uuid.UUID | None,
    email: str,
    phone: str,
    full_name: str,
    delivery_method: str,
    address: dict[str, Any] | None,
    payment_method: str,
    comment: str | None,
) -> tuple[Order, str | None]:
    if delivery_method == "courier" and address is None:
        raise DomainError(
            "Для доставки курьером нужен адрес",
            code="DELIVERY_ADDRESS_REQUIRED",
            status_code=422,
        )
    if payment_method == "online" and not settings.payment_providers_list:
        raise DomainError(
            "Онлайн-оплата временно недоступна",
            code="PAYMENT_METHOD_UNAVAILABLE",
            status_code=422,
        )

    items_qty, promo_code = await cart_service.get_cart_snapshot(cart_key)
    if not items_qty:
        raise DomainError("Корзина пуста", code="EMPTY_CART", status_code=409)

    variants = {
        variant.id: variant
        for variant in (
            await session.scalars(
                select(ProductVariant)
                .options(selectinload(ProductVariant.product))
                .where(ProductVariant.id.in_(items_qty.keys()))
            )
        ).all()
    }

    # ТЗ 5.2 step 2: atomic conditional decrement per line, checked via rowcount --
    # this is what makes concurrent checkouts of the last unit safe: Postgres row
    # locking on the UPDATE means only one concurrent transaction's WHERE clause
    # still matches by the time it runs.
    unavailable: list[dict[str, Any]] = []
    for variant_id, qty in items_qty.items():
        variant = variants.get(variant_id)
        if variant is None:
            unavailable.append({"variant_id": str(variant_id), "available_qty": 0})
            continue

        result = cast(
            "CursorResult[Any]",
            await session.execute(
                update(ProductVariant)
                .where(
                    ProductVariant.id == variant_id,
                    ProductVariant.is_active.is_(True),
                    ProductVariant.stock_qty >= qty,
                )
                .values(stock_qty=ProductVariant.stock_qty - qty)
            ),
        )
        if result.rowcount == 0:
            current_stock = await session.scalar(
                select(ProductVariant.stock_qty).where(ProductVariant.id == variant_id)
            )
            unavailable.append(
                {"variant_id": str(variant_id), "available_qty": current_stock or 0}
            )

    if unavailable:
        raise DomainError(
            "Некоторые товары недоступны в нужном количестве",
            code="OUT_OF_STOCK",
            status_code=409,
            details={"unavailable_items": unavailable},
        )

    order_lines = [(variants[variant_id], qty) for variant_id, qty in items_qty.items()]
    subtotal = sum((variant.price * qty for variant, qty in order_lines), Decimal("0"))

    promo: PromoCode | None = None
    discount_amount = Decimal("0")
    if promo_code:
        candidate = await session.scalar(select(PromoCode).where(PromoCode.code == promo_code))
        is_valid = (
            candidate is not None
            and cart_service.validate_promo(candidate, subtotal=subtotal) is None
        )
        if candidate is not None and is_valid:
            promo = candidate
            discount_amount = cart_service.compute_discount(promo, subtotal=subtotal)

    delivery_cost = _compute_delivery_cost(delivery_method, subtotal)
    total = subtotal - discount_amount + delivery_cost

    now = datetime.now(UTC)
    if payment_method == "cash_on_delivery":
        # ТЗ 5.4: pays on delivery, so it skips awaiting_payment entirely.
        initial_status = "processing"
        expires_at = None
    else:
        initial_status = "awaiting_payment"
        expires_at = now + _ORDER_EXPIRY

    order = Order(
        number=await _generate_order_number(),
        user_id=user_id,
        email=email,
        phone=phone,
        full_name=full_name,
        status=initial_status,
        payment_method=payment_method,
        delivery_method=delivery_method,
        delivery_address=address,
        delivery_cost=delivery_cost,
        subtotal=subtotal,
        total=total,
        promo_code_id=promo.id if promo is not None else None,
        discount_amount=discount_amount,
        comment=comment,
        expires_at=expires_at,
    )
    session.add(order)
    await session.flush()

    for variant, qty in order_lines:
        session.add(
            OrderItem(
                order_id=order.id,
                variant_id=variant.id,
                product_name=variant.product.name,
                variant_options=variant.options,
                sku=variant.sku,
                unit_price=variant.price,
                quantity=qty,
                line_total=variant.price * qty,
            )
        )

    session.add(OrderStatusHistory(order_id=order.id, from_status=None, to_status=initial_status))

    if promo is not None:
        promo.used_count += 1

    payment_url: str | None = None
    if payment_method == "online":
        provider = get_default_provider()
        payment_info = await provider.create_payment(order)
        payment = Payment(
            order_id=order.id,
            provider=provider.name,
            external_id=payment_info.external_id,
            status="created",
            amount=total,
        )
        session.add(payment)
        await session.flush()
        payment_url = payment_info.payment_url

    await session.commit()
    await cart_service.clear_cart(cart_key)

    return order, payment_url


async def transition_status(
    session: AsyncSession,
    order: Order,
    *,
    to_status: str,
    changed_by: uuid.UUID | None,
    comment: str | None = None,
) -> Order:
    allowed = ALLOWED_TRANSITIONS.get(order.status, set())
    if to_status not in allowed:
        raise DomainError(
            f"Переход из «{order.status}» в «{to_status}» запрещён",
            code="INVALID_STATUS_TRANSITION",
            status_code=409,
        )

    from_status = order.status
    order.status = to_status

    if to_status in _STOCK_RESTORING_STATUSES:
        items = (
            await session.scalars(select(OrderItem).where(OrderItem.order_id == order.id))
        ).all()
        for item in items:
            if item.variant_id is None:
                continue
            await session.execute(
                update(ProductVariant)
                .where(ProductVariant.id == item.variant_id)
                .values(stock_qty=ProductVariant.stock_qty + item.quantity)
            )

    session.add(
        OrderStatusHistory(
            order_id=order.id,
            from_status=from_status,
            to_status=to_status,
            changed_by=changed_by,
            comment=comment,
        )
    )
    await session.commit()

    if to_status in _NOTIFY_STATUSES:
        pool = await get_arq_pool()
        await pool.enqueue_job(
            "send_order_status_email", order_id=str(order.id), status=to_status
        )

    return order


async def cancel_order(
    session: AsyncSession, order: Order, *, changed_by: uuid.UUID | None
) -> Order:
    if order.status not in _CUSTOMER_CANCELLABLE_STATUSES:
        raise DomainError(
            "Заказ нельзя отменить на этом этапе",
            code="ORDER_NOT_CANCELLABLE",
            status_code=409,
        )
    return await transition_status(
        session,
        order,
        to_status="cancelled",
        changed_by=changed_by,
        comment="Отменено покупателем",
    )


async def get_order_for_guest(session: AsyncSession, *, number: str, email: str) -> Order:
    order = await session.scalar(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.number == number, Order.email == email)
    )
    if order is None:
        raise DomainError("Заказ не найден", code="ORDER_NOT_FOUND", status_code=404)
    return order


async def list_my_orders(
    session: AsyncSession, *, user_id: uuid.UUID, page: int, page_size: int
) -> tuple[list[Order], int]:
    total = (
        await session.scalar(
            select(func.count()).select_from(Order).where(Order.user_id == user_id)
        )
        or 0
    )
    rows = (
        await session.scalars(
            select(Order)
            .where(Order.user_id == user_id)
            .order_by(Order.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return list(rows), total


async def get_my_order(session: AsyncSession, *, user_id: uuid.UUID, number: str) -> Order:
    order = await session.scalar(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.number == number, Order.user_id == user_id)
    )
    if order is None:
        raise DomainError("Заказ не найден", code="ORDER_NOT_FOUND", status_code=404)
    return order


# --- Admin: orders ---


async def list_orders_admin(
    session: AsyncSession,
    *,
    status_filter: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    search: str | None,
    page: int,
    page_size: int,
) -> tuple[list[Order], int]:
    conditions: list[ColumnElement[bool]] = []
    if status_filter is not None:
        conditions.append(Order.status == status_filter)
    if date_from is not None:
        conditions.append(Order.created_at >= date_from)
    if date_to is not None:
        conditions.append(Order.created_at <= date_to)
    if search:
        pattern = f"%{search}%"
        conditions.append(or_(Order.number.ilike(pattern), Order.email.ilike(pattern)))

    total = (
        await session.scalar(select(func.count()).select_from(Order).where(*conditions))
    ) or 0
    rows = (
        await session.scalars(
            select(Order)
            .where(*conditions)
            .order_by(Order.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return list(rows), total


async def get_order_admin(session: AsyncSession, *, order_id: uuid.UUID) -> Order:
    order = await session.scalar(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.status_history))
        .where(Order.id == order_id)
    )
    if order is None:
        raise DomainError("Заказ не найден", code="ORDER_NOT_FOUND", status_code=404)
    return order


# --- Admin: stats ---


@dataclass
class PeriodStats:
    orders_count: int
    revenue: Decimal


@dataclass
class TopProductStats:
    product_name: str
    quantity_sold: int
    revenue: Decimal


@dataclass
class StatsSummary:
    last_7_days: PeriodStats
    last_30_days: PeriodStats
    top_products: list[TopProductStats]


async def _period_stats(session: AsyncSession, *, since: datetime) -> PeriodStats:
    orders_count = (
        await session.scalar(
            select(func.count()).select_from(Order).where(Order.created_at >= since)
        )
    ) or 0
    revenue = (
        await session.scalar(
            select(func.coalesce(func.sum(Order.total), 0)).where(
                Order.created_at >= since, Order.status != "cancelled"
            )
        )
    ) or Decimal("0")
    return PeriodStats(orders_count=orders_count, revenue=Decimal(revenue))


async def get_stats_summary(session: AsyncSession) -> StatsSummary:
    now = datetime.now(UTC)
    top_products_since = now - timedelta(days=30)

    # Scoped to the same 30-day window as the headline numbers -- an all-time
    # top-5 would just ossify into the same list forever on a live dashboard.
    top_rows = (
        await session.execute(
            select(
                OrderItem.product_name,
                func.sum(OrderItem.quantity).label("quantity_sold"),
                func.sum(OrderItem.line_total).label("revenue"),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.status != "cancelled", Order.created_at >= top_products_since)
            .group_by(OrderItem.product_name)
            .order_by(func.sum(OrderItem.quantity).desc())
            .limit(5)
        )
    ).all()

    return StatsSummary(
        last_7_days=await _period_stats(session, since=now - timedelta(days=7)),
        last_30_days=await _period_stats(session, since=now - timedelta(days=30)),
        top_products=[
            TopProductStats(
                product_name=row.product_name,
                quantity_sold=row.quantity_sold,
                revenue=Decimal(row.revenue),
            )
            for row in top_rows
        ],
    )
