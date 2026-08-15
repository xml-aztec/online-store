import asyncio
import io
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.auth.models import User
from app.catalog import service as catalog_service
from app.catalog.models import Banner, Category, ProductImage, ProductVariant
from app.config import settings
from app.core.email import render_email_template, send_email
from app.core.storage import get_s3_client
from app.database import async_session_factory
from app.imports import service as imports_service
from app.orders import service as orders_service
from app.orders.models import Order
from app.payments.models import Payment
from app.telegram import service as telegram_service

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

_PREVIEW_THUMBNAIL_SIZE = 400
_PREVIEW_LARGE_SIZE = 800
# Banners render full-bleed across the homepage hero, so the "large" preview
# needs to hold up at desktop widths -- 800px (sized for a product gallery)
# would look visibly soft stretched across a ~1200px+ container.
_BANNER_THUMBNAIL_SIZE = 400
_BANNER_HERO_SIZE = 1920
# Category tiles render at roughly half a ~1280px container -- 800px covers
# that at 2x pixel density without the hero-banner-sized upload cost.
_CATEGORY_THUMBNAIL_SIZE = 300
_CATEGORY_IMAGE_SIZE = 800

_ORDER_STATUS_LABELS = {
    "paid": "оплата получена",
    "shipped": "заказ отправлен",
    "cancelled": "заказ отменён",
}


async def send_verification_email(ctx: dict[str, Any], *, user_id: str, token: str) -> None:
    async with async_session_factory() as session:
        user = await session.get(User, uuid.UUID(user_id))
        if user is None:
            return

        verify_url = f"{settings.domain}/verify-email?token={token}"
        html = render_email_template(
            "verify_email.html", full_name=user.full_name, verify_url=verify_url
        )
        await send_email(to=user.email, subject="Подтверждение email — HobbyLife", html=html)


async def send_password_reset_email(ctx: dict[str, Any], *, user_id: str, token: str) -> None:
    async with async_session_factory() as session:
        user = await session.get(User, uuid.UUID(user_id))
        if user is None:
            return

        reset_url = f"{settings.domain}/reset-password?token={token}"
        html = render_email_template(
            "reset_password.html", full_name=user.full_name, reset_url=reset_url
        )
        await send_email(to=user.email, subject="Восстановление пароля — HobbyLife", html=html)


async def send_set_password_email(
    ctx: dict[str, Any], *, user_id: str, token: str, order_number: str
) -> None:
    # ТЗ 4: guest checkout may create an account with password_hash NULL (see
    # app/auth/service.py::get_or_create_guest_account) -- this is how that
    # account gets claimed. Reuses the password_reset token purpose/endpoint
    # (POST /auth/reset-password): a NULL password_hash fingerprints the same
    # way as any other, so "set my first password" and "reset my password"
    # are literally the same operation from the token's point of view.
    async with async_session_factory() as session:
        user = await session.get(User, uuid.UUID(user_id))
        if user is None:
            return

        set_password_url = f"{settings.domain}/reset-password?token={token}"
        html = render_email_template(
            "set_password.html",
            full_name=user.full_name,
            order_number=order_number,
            set_password_url=set_password_url,
        )
        await send_email(
            to=user.email, subject="Установите пароль — HobbyLife", html=html
        )


async def process_product_image(
    ctx: dict[str, Any], *, image_id: str, original_s3_key: str
) -> None:
    thumbnail_key, large_key = await asyncio.to_thread(
        _generate_previews,
        original_s3_key,
        thumbnail_size=_PREVIEW_THUMBNAIL_SIZE,
        large_size=_PREVIEW_LARGE_SIZE,
    )

    async with async_session_factory() as session:
        image = await session.get(ProductImage, uuid.UUID(image_id))
        if image is None:
            return
        image.s3_key = large_key
        image.thumbnail_s3_key = thumbnail_key
        await session.commit()


async def process_banner_image(
    ctx: dict[str, Any], *, banner_id: str, original_s3_key: str
) -> None:
    thumbnail_key, hero_key = await asyncio.to_thread(
        _generate_previews,
        original_s3_key,
        thumbnail_size=_BANNER_THUMBNAIL_SIZE,
        large_size=_BANNER_HERO_SIZE,
    )

    async with async_session_factory() as session:
        banner = await session.get(Banner, uuid.UUID(banner_id))
        if banner is None:
            return
        # The banner's photo may have been replaced (replace_banner_image)
        # while this resize was in flight -- s3_key no longer pointing at the
        # original we just resized means our result is stale, and applying it
        # would silently revert the banner back to the old, now-deleted photo.
        if banner.s3_key != original_s3_key:
            return
        banner.s3_key = hero_key
        banner.thumbnail_s3_key = thumbnail_key
        await session.commit()


async def process_category_image(
    ctx: dict[str, Any], *, category_id: str, original_s3_key: str
) -> None:
    thumbnail_key, image_key = await asyncio.to_thread(
        _generate_previews,
        original_s3_key,
        thumbnail_size=_CATEGORY_THUMBNAIL_SIZE,
        large_size=_CATEGORY_IMAGE_SIZE,
    )

    async with async_session_factory() as session:
        category = await session.get(Category, uuid.UUID(category_id))
        if category is None:
            return
        # Same staleness guard as process_banner_image -- a second upload
        # while this resize was in flight means our result no longer matches
        # what's actually stored.
        if category.image_s3_key != original_s3_key:
            return
        category.image_s3_key = image_key
        category.image_thumbnail_s3_key = thumbnail_key
        await session.commit()
        await catalog_service.invalidate_category_cache()


def _generate_previews(
    original_s3_key: str, *, thumbnail_size: int, large_size: int
) -> tuple[str, str]:
    client = get_s3_client()
    original_bytes = client.get_object(Bucket=settings.s3_bucket, Key=original_s3_key)[
        "Body"
    ].read()

    base_path = original_s3_key.rsplit("/", 1)[0]
    thumbnail_key = f"{base_path}/{thumbnail_size}.webp"
    large_key = f"{base_path}/{large_size}.webp"

    with Image.open(io.BytesIO(original_bytes)) as original:
        original.load()
        _save_resized(client, original, max_size=thumbnail_size, key=thumbnail_key)
        _save_resized(client, original, max_size=large_size, key=large_key)

    return thumbnail_key, large_key


def _save_resized(client: "S3Client", image: Image.Image, *, max_size: int, key: str) -> None:
    mode = "RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB"
    resized = image.convert(mode)
    resized.thumbnail((max_size, max_size))

    buffer = io.BytesIO()
    resized.save(buffer, format="WEBP", quality=82)
    client.put_object(
        Bucket=settings.s3_bucket, Key=key, Body=buffer.getvalue(), ContentType="image/webp"
    )


async def send_order_status_email(ctx: dict[str, Any], *, order_id: str, status: str) -> None:
    async with async_session_factory() as session:
        order = await session.get(Order, uuid.UUID(order_id))
        if order is None:
            return

        html = render_email_template(
            "order_status_update.html",
            order_number=order.number,
            full_name=order.full_name,
            status_label=_ORDER_STATUS_LABELS.get(status, status),
            order_url=f"{settings.domain}/account/orders/{order.number}",
        )
        await send_email(to=order.email, subject=f"Заказ {order.number} — HobbyLife", html=html)


async def process_payment_succeeded(ctx: dict[str, Any], *, payment_id: str) -> None:
    async with async_session_factory() as session:
        payment = await session.get(Payment, uuid.UUID(payment_id))
        if payment is None:
            return
        order = await session.get(Order, payment.order_id)
        if order is None or order.status != "awaiting_payment":
            return
        await orders_service.transition_status_from_payment(
            session, order, comment="Оплата подтверждена"
        )


async def cancel_expired_orders(ctx: dict[str, Any]) -> None:
    async with async_session_factory() as session:
        now = datetime.now(UTC)
        expired = (
            await session.scalars(
                select(Order).where(Order.status == "awaiting_payment", Order.expires_at < now)
            )
        ).all()
        for order in expired:
            await orders_service.transition_status(
                session,
                order,
                to_status="cancelled",
                changed_by=None,
                comment="Истёк срок оплаты",
            )


async def apply_import_job(ctx: dict[str, Any], *, import_job_id: str) -> None:
    async with async_session_factory() as session:
        await imports_service.apply_import(session, import_job_id=uuid.UUID(import_job_id))


async def send_telegram_new_order(ctx: dict[str, Any], *, order_id: str) -> None:
    async with async_session_factory() as session:
        order = await session.scalar(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.id == uuid.UUID(order_id))
        )
        if order is None:
            return
        await telegram_service.notify_new_order(session, order)


async def send_telegram_status_change(ctx: dict[str, Any], *, order_id: str) -> None:
    async with async_session_factory() as session:
        order = await session.scalar(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.id == uuid.UUID(order_id))
        )
        if order is None:
            return
        await telegram_service.notify_status_change(session, order)


async def send_telegram_low_stock(ctx: dict[str, Any], *, variant_id: str) -> None:
    async with async_session_factory() as session:
        variant = await session.scalar(
            select(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .where(ProductVariant.id == uuid.UUID(variant_id))
        )
        if variant is None:
            return
        await telegram_service.notify_low_stock(session, variant)


async def send_telegram_daily_digest(ctx: dict[str, Any]) -> None:
    async with async_session_factory() as session:
        await telegram_service.send_daily_digest(session)
