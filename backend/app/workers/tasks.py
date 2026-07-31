import asyncio
import io
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from PIL import Image
from sqlalchemy import select

from app.auth.models import User
from app.catalog.models import ProductImage
from app.config import settings
from app.core.email import send_email
from app.core.storage import get_s3_client
from app.database import async_session_factory
from app.imports import service as imports_service
from app.orders import service as orders_service
from app.orders.models import Order
from app.payments.models import Payment

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

_PREVIEW_THUMBNAIL_SIZE = 400
_PREVIEW_LARGE_SIZE = 800

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
        await send_email(
            to=user.email,
            subject="Подтверждение email — HobbyLife",
            template_name="verify_email.html",
            context={"full_name": user.full_name, "verify_url": verify_url},
        )


async def send_password_reset_email(ctx: dict[str, Any], *, user_id: str, token: str) -> None:
    async with async_session_factory() as session:
        user = await session.get(User, uuid.UUID(user_id))
        if user is None:
            return

        reset_url = f"{settings.domain}/reset-password?token={token}"
        await send_email(
            to=user.email,
            subject="Восстановление пароля — HobbyLife",
            template_name="reset_password.html",
            context={"full_name": user.full_name, "reset_url": reset_url},
        )


async def process_product_image(
    ctx: dict[str, Any], *, image_id: str, original_s3_key: str
) -> None:
    thumbnail_key, large_key = await asyncio.to_thread(_generate_previews, original_s3_key)

    async with async_session_factory() as session:
        image = await session.get(ProductImage, uuid.UUID(image_id))
        if image is None:
            return
        image.s3_key = large_key
        image.thumbnail_s3_key = thumbnail_key
        await session.commit()


def _generate_previews(original_s3_key: str) -> tuple[str, str]:
    client = get_s3_client()
    original_bytes = client.get_object(Bucket=settings.s3_bucket, Key=original_s3_key)[
        "Body"
    ].read()

    base_path = original_s3_key.rsplit("/", 1)[0]
    thumbnail_key = f"{base_path}/{_PREVIEW_THUMBNAIL_SIZE}.webp"
    large_key = f"{base_path}/{_PREVIEW_LARGE_SIZE}.webp"

    with Image.open(io.BytesIO(original_bytes)) as original:
        original.load()
        _save_resized(client, original, max_size=_PREVIEW_THUMBNAIL_SIZE, key=thumbnail_key)
        _save_resized(client, original, max_size=_PREVIEW_LARGE_SIZE, key=large_key)

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

        await send_email(
            to=order.email,
            subject=f"Заказ {order.number} — HobbyLife",
            template_name="order_status_update.html",
            context={
                "order_number": order.number,
                "full_name": order.full_name,
                "status_label": _ORDER_STATUS_LABELS.get(status, status),
            },
        )


async def process_payment_succeeded(ctx: dict[str, Any], *, payment_id: str) -> None:
    async with async_session_factory() as session:
        payment = await session.get(Payment, uuid.UUID(payment_id))
        if payment is None:
            return
        order = await session.get(Order, payment.order_id)
        if order is None or order.status != "awaiting_payment":
            return
        await orders_service.transition_status(
            session, order, to_status="paid", changed_by=None, comment="Оплата подтверждена"
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
