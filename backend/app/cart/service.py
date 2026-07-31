import uuid
from datetime import UTC, datetime
from decimal import Decimal

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.cart.schemas import CartItemResponse, CartResponse
from app.catalog.models import ProductImage, ProductVariant
from app.core.redis import get_redis
from app.core.storage import generate_presigned_url
from app.exceptions import DomainError
from app.orders.models import PromoCode

CART_COOKIE_NAME = "cart_id"

_CART_TTL_SECONDS = 30 * 24 * 60 * 60
_MAX_LINE_ITEMS = 50
_MAX_QTY_PER_ITEM = 99
# Sentinel hash field for the applied promo code, stored alongside the
# {variant_id: qty} entries in the same Redis hash -- not a valid UUID, so it
# can never collide with a real variant_id key.
_PROMO_FIELD = "__promo_code__"


def user_cart_key(user_id: uuid.UUID) -> str:
    return f"cart:user:{user_id}"


def guest_cart_key(cart_id: str) -> str:
    return f"cart:{cart_id}"


def _parse_items(raw: dict[str, str]) -> dict[uuid.UUID, int]:
    return {uuid.UUID(key): int(value) for key, value in raw.items() if key != _PROMO_FIELD}


async def _touch_ttl(redis: Redis, key: str) -> None:
    await redis.expire(key, _CART_TTL_SECONDS)


# redis-py types the async hgetall/hset/hdel commands as `Awaitable[T] | T` (a stub
# gap shared by a handful of hash commands, unlike e.g. get/set/expire/delete which
# resolve cleanly) -- mypy strict correctly flags awaiting something that isn't
# purely awaitable. Centralize the workaround here instead of at every call site.
async def _hgetall(redis: Redis, key: str) -> dict[str, str]:
    return await redis.hgetall(key)  # type: ignore[misc, no-any-return]


async def _hset(redis: Redis, key: str, field: str, value: str) -> None:
    await redis.hset(key, field, value)  # type: ignore[misc]


async def _hdel(redis: Redis, key: str, field: str) -> None:
    await redis.hdel(key, field)  # type: ignore[misc]


async def _load_primary_images(
    session: AsyncSession, product_ids: list[uuid.UUID]
) -> dict[uuid.UUID, str]:
    if not product_ids:
        return {}

    rows = (
        await session.execute(
            select(ProductImage.product_id, ProductImage.s3_key, ProductImage.thumbnail_s3_key)
            .where(ProductImage.product_id.in_(product_ids))
            .order_by(ProductImage.product_id, ProductImage.sort_order)
        )
    ).all()

    primary_by_product: dict[uuid.UUID, str] = {}
    for product_id, s3_key, thumbnail_s3_key in rows:
        if product_id not in primary_by_product:
            primary_by_product[product_id] = generate_presigned_url(thumbnail_s3_key or s3_key)
    return primary_by_product


def validate_promo(promo: PromoCode, *, subtotal: Decimal) -> DomainError | None:
    now = datetime.now(UTC)
    if not promo.is_active:
        return DomainError("Промокод недействителен", code="PROMO_INACTIVE", status_code=409)
    if promo.starts_at is not None and now < promo.starts_at:
        return DomainError("Промокод ещё не активен", code="PROMO_NOT_STARTED", status_code=409)
    if promo.ends_at is not None and now > promo.ends_at:
        return DomainError("Срок действия промокода истёк", code="PROMO_EXPIRED", status_code=409)
    if promo.max_uses is not None and promo.used_count >= promo.max_uses:
        return DomainError(
            "Промокод больше недоступен", code="PROMO_USES_EXCEEDED", status_code=409
        )
    if promo.min_order_total is not None and subtotal < promo.min_order_total:
        return DomainError(
            "Сумма заказа меньше минимальной для промокода",
            code="PROMO_MIN_ORDER_NOT_MET",
            status_code=409,
            details={"min_order_total": str(promo.min_order_total)},
        )
    return None


def compute_discount(promo: PromoCode, *, subtotal: Decimal) -> Decimal:
    if promo.discount_type == "percent":
        return (subtotal * promo.discount_value / Decimal("100")).quantize(Decimal("0.01"))
    return min(promo.discount_value, subtotal)


async def _build_cart_response(session: AsyncSession, raw: dict[str, str]) -> CartResponse:
    promo_code = raw.get(_PROMO_FIELD)
    items_qty = _parse_items(raw)

    variants: list[ProductVariant] = []
    if items_qty:
        variants = list(
            (
                await session.scalars(
                    select(ProductVariant)
                    .options(selectinload(ProductVariant.product))
                    .where(ProductVariant.id.in_(items_qty.keys()))
                )
            ).all()
        )
    variants_by_id = {variant.id: variant for variant in variants}

    images_by_product = await _load_primary_images(
        session, list({variant.product_id for variant in variants})
    )

    items: list[CartItemResponse] = []
    subtotal = Decimal("0")
    for variant_id, qty in items_qty.items():
        variant = variants_by_id.get(variant_id)
        if variant is None:
            # Variant was deleted entirely since being added -- nothing left to show.
            continue

        is_available = variant.is_active and variant.stock_qty > 0
        available_qty = variant.stock_qty if variant.is_active else 0
        line_total = variant.price * qty
        subtotal += line_total

        items.append(
            CartItemResponse(
                variant_id=variant.id,
                product_id=variant.product_id,
                product_name=variant.product.name,
                product_slug=variant.product.slug,
                sku=variant.sku,
                options=variant.options,
                image_url=images_by_product.get(variant.product_id),
                price=variant.price,
                qty=qty,
                line_total=line_total,
                is_available=is_available,
                available_qty=available_qty,
            )
        )

    discount_amount = Decimal("0")
    if promo_code:
        promo = await session.scalar(select(PromoCode).where(PromoCode.code == promo_code))
        if promo is not None and validate_promo(promo, subtotal=subtotal) is None:
            discount_amount = compute_discount(promo, subtotal=subtotal)

    return CartResponse(
        items=items,
        subtotal=subtotal,
        promo_code=promo_code,
        discount_amount=discount_amount,
        total=subtotal - discount_amount,
    )


async def get_cart(session: AsyncSession, key: str) -> CartResponse:
    redis = get_redis()
    raw = await _hgetall(redis, key)
    return await _build_cart_response(session, raw)


async def get_cart_snapshot(key: str) -> tuple[dict[uuid.UUID, int], str | None]:
    """Raw {variant_id: qty} + applied promo code, with no DB enrichment -- for
    checkout (app.orders.service), which needs to read quantities once and then
    do its own price/stock reads inside the order-creation transaction."""
    redis = get_redis()
    raw = await _hgetall(redis, key)
    return _parse_items(raw), raw.get(_PROMO_FIELD)


async def _get_variant_or_404(session: AsyncSession, variant_id: uuid.UUID) -> ProductVariant:
    variant = await session.get(ProductVariant, variant_id)
    if variant is None:
        raise DomainError("Вариант не найден", code="VARIANT_NOT_FOUND", status_code=404)
    return variant


async def add_item(
    session: AsyncSession, key: str, *, variant_id: uuid.UUID, qty: int
) -> CartResponse:
    await _get_variant_or_404(session, variant_id)

    redis = get_redis()
    raw = await _hgetall(redis, key)
    items = _parse_items(raw)

    if variant_id not in items and len(items) >= _MAX_LINE_ITEMS:
        raise DomainError(
            "Превышен лимит позиций в корзине (максимум 50)",
            code="CART_LIMIT_EXCEEDED",
            status_code=422,
        )

    new_qty = min(items.get(variant_id, 0) + qty, _MAX_QTY_PER_ITEM)
    await _hset(redis, key, str(variant_id), str(new_qty))
    await _touch_ttl(redis, key)
    return await get_cart(session, key)


async def set_item_qty(
    session: AsyncSession, key: str, *, variant_id: uuid.UUID, qty: int
) -> CartResponse:
    redis = get_redis()

    if qty <= 0:
        await _hdel(redis, key, str(variant_id))
        return await get_cart(session, key)

    await _get_variant_or_404(session, variant_id)

    raw = await _hgetall(redis, key)
    items = _parse_items(raw)
    if variant_id not in items and len(items) >= _MAX_LINE_ITEMS:
        raise DomainError(
            "Превышен лимит позиций в корзине (максимум 50)",
            code="CART_LIMIT_EXCEEDED",
            status_code=422,
        )

    await _hset(redis, key, str(variant_id), str(min(qty, _MAX_QTY_PER_ITEM)))
    await _touch_ttl(redis, key)
    return await get_cart(session, key)


async def clear_cart(key: str) -> None:
    redis = get_redis()
    await redis.delete(key)


async def apply_promo(session: AsyncSession, key: str, *, code: str) -> CartResponse:
    normalized_code = code.strip().upper()
    promo = await session.scalar(select(PromoCode).where(PromoCode.code == normalized_code))
    if promo is None:
        raise DomainError("Промокод не найден", code="PROMO_NOT_FOUND", status_code=404)

    current_cart = await get_cart(session, key)
    error = validate_promo(promo, subtotal=current_cart.subtotal)
    if error is not None:
        raise error

    redis = get_redis()
    await _hset(redis, key, _PROMO_FIELD, normalized_code)
    await _touch_ttl(redis, key)
    return await get_cart(session, key)


async def merge_guest_cart_into_user(
    session: AsyncSession, *, cart_id: str, user_id: uuid.UUID
) -> None:
    redis = get_redis()
    guest_key = guest_cart_key(cart_id)
    user_key = user_cart_key(user_id)

    guest_raw = await _hgetall(redis, guest_key)
    if not guest_raw:
        return

    guest_items = _parse_items(guest_raw)
    guest_promo = guest_raw.get(_PROMO_FIELD)

    user_raw = await _hgetall(redis, user_key)
    user_items = _parse_items(user_raw)
    user_promo = user_raw.get(_PROMO_FIELD)

    variant_ids = set(guest_items) | set(user_items)
    stock_by_variant: dict[uuid.UUID, int] = {}
    if variant_ids:
        rows = await session.execute(
            select(ProductVariant.id, ProductVariant.stock_qty).where(
                ProductVariant.id.in_(variant_ids)
            )
        )
        stock_by_variant = {row[0]: row[1] for row in rows.all()}

    merged: dict[uuid.UUID, int] = dict(user_items)
    for variant_id, qty in guest_items.items():
        combined = merged.get(variant_id, 0) + qty
        capped = min(combined, stock_by_variant.get(variant_id, 0), _MAX_QTY_PER_ITEM)
        if capped > 0:
            merged[variant_id] = capped
        else:
            merged.pop(variant_id, None)

    if len(merged) > _MAX_LINE_ITEMS:
        merged = dict(list(merged.items())[:_MAX_LINE_ITEMS])

    promo_to_keep = user_promo or guest_promo

    async with redis.pipeline() as pipe:
        pipe.delete(user_key)
        if merged:
            pipe.hset(user_key, mapping={str(k): str(v) for k, v in merged.items()})
        if promo_to_keep:
            pipe.hset(user_key, _PROMO_FIELD, promo_to_keep)
        if merged or promo_to_keep:
            pipe.expire(user_key, _CART_TTL_SECONDS)
        pipe.delete(guest_key)
        await pipe.execute()
