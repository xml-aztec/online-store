import io
import uuid
from decimal import Decimal

import httpx
import pytest
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.models import User
from app.catalog.models import Category, Product, ProductImage
from app.core.queue import get_arq_pool
from app.core.security import create_access_token
from app.core.storage import generate_presigned_url
from app.workers.tasks import process_product_image
from tests.helpers import s3_public_url_reachable, s3_reachable

pytestmark = pytest.mark.skipif(
    not s3_reachable(), reason="S3/MinIO endpoint is not reachable in this environment"
)


def _slug(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


async def _admin_headers(session: AsyncSession) -> dict[str, str]:
    user = User(email=f"admin-{uuid.uuid4().hex[:10]}@example.com", role="admin")
    session.add(user)
    await session.flush()
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


def _fake_jpeg_bytes(size: tuple[int, int] = (1200, 900)) -> bytes:
    image = Image.new("RGB", size, color=(200, 50, 50))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


async def _get_enqueued_image_job(image_id: uuid.UUID) -> dict[str, str]:
    pool = await get_arq_pool()
    jobs = await pool.queued_jobs()
    matching = [
        job
        for job in jobs
        if job.function == "process_product_image" and job.kwargs.get("image_id") == str(image_id)
    ]
    assert matching, f"No process_product_image job enqueued for image {image_id}"
    return matching[-1].kwargs


@pytest.mark.asyncio
async def test_upload_rejects_non_image_file(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    category = Category(name="Категория", slug=_slug("cat"))
    db_session.add(category)
    await db_session.flush()
    product = Product(category_id=category.id, name="Товар", slug=_slug("product"))
    db_session.add(product)
    await db_session.commit()

    response = await client.post(
        f"/v1/admin/products/{product.id}/images",
        files={"file": ("not-an-image.txt", b"hello", "text/plain")},
        headers=headers,
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IMAGE"


@pytest.mark.asyncio
@pytest.mark.skipif(
    not s3_public_url_reachable(),
    reason="S3 public URL host is not reachable from this environment (e.g. inside a "
    "container, where 'localhost' isn't the host machine a browser would use)",
)
async def test_upload_enqueues_resize_job_and_resize_produces_two_webp_previews(
    client: httpx.AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The worker task opens its own DB session/connection (correctly mirroring a real
    # worker process). db_session wraps the test in an uncommitted outer transaction,
    # so a genuinely separate connection could never see rows created through it --
    # bind the task's session factory to the *same* connection for this test only.
    monkeypatch.setattr(
        "app.workers.tasks.async_session_factory",
        async_sessionmaker(
            bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint"
        ),
    )

    headers = await _admin_headers(db_session)
    category = Category(name="Категория", slug=_slug("cat"))
    db_session.add(category)
    await db_session.flush()
    product = Product(category_id=category.id, name="Товар", slug=_slug("product"))
    db_session.add(product)
    await db_session.commit()

    upload_response = await client.post(
        f"/v1/admin/products/{product.id}/images",
        files={"file": ("photo.jpg", _fake_jpeg_bytes(), "image/jpeg")},
        headers=headers,
    )
    assert upload_response.status_code == 201
    image_id = uuid.UUID(upload_response.json()["id"])

    job_kwargs = await _get_enqueued_image_job(image_id)

    # Run the resize task directly (no live worker process during tests) to verify
    # it actually generates both previews and updates the image row.
    await process_product_image(
        {}, image_id=job_kwargs["image_id"], original_s3_key=job_kwargs["original_s3_key"]
    )

    refreshed = await db_session.get(ProductImage, image_id)
    await db_session.refresh(refreshed)
    assert refreshed is not None
    assert refreshed.s3_key.endswith("800.webp")
    assert refreshed.thumbnail_s3_key is not None
    assert refreshed.thumbnail_s3_key.endswith("400.webp")

    large_response = httpx.get(generate_presigned_url(refreshed.s3_key))
    thumb_response = httpx.get(generate_presigned_url(refreshed.thumbnail_s3_key))
    assert large_response.status_code == 200
    assert thumb_response.status_code == 200

    large_image = Image.open(io.BytesIO(large_response.content))
    thumb_image = Image.open(io.BytesIO(thumb_response.content))
    assert large_image.format == "WEBP"
    assert max(large_image.size) == 800
    assert thumb_image.format == "WEBP"
    assert max(thumb_image.size) == 400


@pytest.mark.asyncio
async def test_full_scenario_category_product_variants_photo_visible_in_public_catalog(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)

    category_response = await client.post(
        "/v1/admin/categories",
        json={"name": "Сценарий", "slug": _slug("scenario-cat")},
        headers=headers,
    )
    assert category_response.status_code == 201
    category_id = category_response.json()["id"]

    product_slug = _slug("scenario-product")
    product_response = await client.post(
        "/v1/admin/products",
        json={
            "category_id": category_id,
            "name": "Сценарный товар",
            "slug": product_slug,
            "description": "Товар из сценарного теста",
        },
        headers=headers,
    )
    assert product_response.status_code == 201
    product_id = product_response.json()["id"]

    # Not visible yet: is_active defaults to true, but no variant means no listing
    # (matches "a product needs at least one variant" -- see 4/product_variants).
    no_variants_check = await client.get("/v1/products", params={"q": "Сценарный"})
    assert product_slug not in {item["slug"] for item in no_variants_check.json()["items"]}

    variant_one = await client.post(
        f"/v1/admin/products/{product_id}/variants",
        json={
            "sku": _slug("sku"),
            "price": "300.00",
            "stock_qty": 15,
            "options": {"color": "черный"},
        },
        headers=headers,
    )
    variant_two = await client.post(
        f"/v1/admin/products/{product_id}/variants",
        json={
            "sku": _slug("sku"),
            "price": "350.00",
            "stock_qty": 8,
            "options": {"color": "белый"},
        },
        headers=headers,
    )
    assert variant_one.status_code == 201
    assert variant_two.status_code == 201

    photo_response = await client.post(
        f"/v1/admin/products/{product_id}/images",
        files={"file": ("photo.jpg", _fake_jpeg_bytes(), "image/jpeg")},
        headers=headers,
    )
    assert photo_response.status_code == 201

    public_list = await client.get("/v1/products", params={"q": "Сценарный"})
    assert product_slug in {item["slug"] for item in public_list.json()["items"]}

    public_detail = await client.get(f"/v1/products/{product_slug}")
    assert public_detail.status_code == 200
    body = public_detail.json()
    assert len(body["variants"]) == 2
    assert len(body["images"]) == 1
    assert Decimal(body["variants"][0]["price"]) in {Decimal("300.00"), Decimal("350.00")}
