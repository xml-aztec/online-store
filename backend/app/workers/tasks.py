import asyncio
import io
import uuid
from typing import TYPE_CHECKING, Any

from PIL import Image

from app.auth.models import User
from app.catalog.models import ProductImage
from app.config import settings
from app.core.email import send_email
from app.core.storage import get_s3_client
from app.database import async_session_factory

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

_PREVIEW_THUMBNAIL_SIZE = 400
_PREVIEW_LARGE_SIZE = 800


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
