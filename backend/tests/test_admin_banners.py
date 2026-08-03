import io
import uuid

import httpx
import pytest
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.models import User
from app.catalog.models import Banner
from app.config import settings
from app.core.queue import get_arq_pool
from app.core.security import create_access_token
from app.core.storage import generate_presigned_url, get_s3_client
from app.workers.tasks import process_banner_image
from tests.helpers import s3_public_url_reachable, s3_reachable

pytestmark = pytest.mark.skipif(
    not s3_reachable(), reason="S3/MinIO endpoint is not reachable in this environment"
)


async def _make_user(session: AsyncSession, *, role: str) -> User:
    user = User(email=f"{role}-{uuid.uuid4().hex[:10]}@example.com", role=role)
    session.add(user)
    await session.flush()
    return user


async def _admin_headers(session: AsyncSession) -> dict[str, str]:
    user = await _make_user(session, role="admin")
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


def _fake_jpeg_bytes(size: tuple[int, int] = (2400, 900)) -> bytes:
    image = Image.new("RGB", size, color=(30, 90, 200))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


async def _create_banner(
    client: httpx.AsyncClient, headers: dict[str, str], **fields: str
) -> httpx.Response:
    return await client.post(
        "/v1/admin/banners",
        files={"file": ("banner.jpg", _fake_jpeg_bytes(), "image/jpeg")},
        data=fields,
        headers=headers,
    )


async def _get_enqueued_banner_job(banner_id: uuid.UUID) -> dict[str, str]:
    pool = await get_arq_pool()
    jobs = await pool.queued_jobs()
    matching = [
        job
        for job in jobs
        if job.function == "process_banner_image" and job.kwargs.get("banner_id") == str(banner_id)
    ]
    assert matching, f"No process_banner_image job enqueued for banner {banner_id}"
    return matching[-1].kwargs


@pytest.mark.asyncio
async def test_admin_banner_endpoints_require_admin_role(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    no_auth = await client.get("/v1/admin/banners")
    assert no_auth.status_code == 401

    customer = await _make_user(db_session, role="customer")
    customer_headers = {
        "Authorization": f"Bearer {create_access_token(customer.id, customer.role)}"
    }
    forbidden = await client.get("/v1/admin/banners", headers=customer_headers)
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_create_banner_rejects_non_image_file(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)

    response = await client.post(
        "/v1/admin/banners",
        files={"file": ("not-an-image.txt", b"hello", "text/plain")},
        data={"title": "Заголовок"},
        headers=headers,
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IMAGE"


@pytest.mark.asyncio
async def test_create_banner_persists_fields_and_enqueues_resize_job(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)

    response = await _create_banner(
        client,
        headers,
        title="Скидки до 30%",
        subtitle="Только на этой неделе",
        link_url="/catalog?on_sale=true",
        button_text="Смотреть акции",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Скидки до 30%"
    assert body["subtitle"] == "Только на этой неделе"
    assert body["link_url"] == "/catalog?on_sale=true"
    assert body["button_text"] == "Смотреть акции"
    assert body["is_active"] is True
    assert body["sort_order"] == 0
    assert body["image_url"]

    await _get_enqueued_banner_job(uuid.UUID(body["id"]))


@pytest.mark.asyncio
@pytest.mark.skipif(
    not s3_public_url_reachable(),
    reason="S3 public URL host is not reachable from this environment",
)
async def test_upload_resize_produces_hero_and_thumbnail_previews(
    client: httpx.AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "app.workers.tasks.async_session_factory",
        async_sessionmaker(
            bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint"
        ),
    )

    headers = await _admin_headers(db_session)
    upload_response = await _create_banner(client, headers, title="Главный баннер")
    assert upload_response.status_code == 201
    banner_id = uuid.UUID(upload_response.json()["id"])

    job_kwargs = await _get_enqueued_banner_job(banner_id)
    await process_banner_image(
        {}, banner_id=job_kwargs["banner_id"], original_s3_key=job_kwargs["original_s3_key"]
    )

    refreshed = await db_session.get(Banner, banner_id)
    await db_session.refresh(refreshed)
    assert refreshed is not None
    assert refreshed.s3_key.endswith("1920.webp")
    assert refreshed.thumbnail_s3_key is not None
    assert refreshed.thumbnail_s3_key.endswith("400.webp")

    hero_response = httpx.get(generate_presigned_url(refreshed.s3_key))
    thumb_response = httpx.get(generate_presigned_url(refreshed.thumbnail_s3_key))
    assert hero_response.status_code == 200
    assert thumb_response.status_code == 200

    hero_image = Image.open(io.BytesIO(hero_response.content))
    thumb_image = Image.open(io.BytesIO(thumb_response.content))
    assert hero_image.format == "WEBP"
    assert max(hero_image.size) == 1920
    assert thumb_image.format == "WEBP"
    assert max(thumb_image.size) == 400


@pytest.mark.asyncio
async def test_list_banners_admin_includes_inactive_public_excludes(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)

    active = await _create_banner(client, headers, title="Активный")
    inactive = await _create_banner(client, headers, title="Скрытый")
    assert active.status_code == 201 and inactive.status_code == 201

    toggle = await client.patch(
        f"/v1/admin/banners/{inactive.json()['id']}",
        json={"is_active": False},
        headers=headers,
    )
    assert toggle.status_code == 200
    assert toggle.json()["is_active"] is False

    admin_list = await client.get("/v1/admin/banners", headers=headers)
    assert admin_list.status_code == 200
    assert {b["title"] for b in admin_list.json()} == {"Активный", "Скрытый"}

    public_list = await client.get("/v1/banners")
    assert public_list.status_code == 200
    assert {b["title"] for b in public_list.json()} == {"Активный"}


@pytest.mark.asyncio
async def test_update_banner_text_fields(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    created = await _create_banner(client, headers, title="Старый заголовок")
    banner_id = created.json()["id"]

    response = await client.patch(
        f"/v1/admin/banners/{banner_id}",
        json={"title": "Новый заголовок", "button_text": "Купить"},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Новый заголовок"
    assert body["button_text"] == "Купить"


@pytest.mark.asyncio
async def test_replace_banner_image_removes_old_s3_objects(
    client: httpx.AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Drive the first upload's resize to completion before replacing it --
    # otherwise this races the real background worker (also polling the same
    # Redis queue in this environment) and can flake depending on whether its
    # job finishes before or after the replace call below.
    monkeypatch.setattr(
        "app.workers.tasks.async_session_factory",
        async_sessionmaker(
            bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint"
        ),
    )

    headers = await _admin_headers(db_session)
    created = await _create_banner(client, headers, title="Баннер")
    banner_id = created.json()["id"]

    banner = await db_session.get(Banner, uuid.UUID(banner_id))
    assert banner is not None
    old_prefix = banner.s3_key.rsplit("/", 1)[0] + "/"

    job_kwargs = await _get_enqueued_banner_job(uuid.UUID(banner_id))
    await process_banner_image(
        {}, banner_id=job_kwargs["banner_id"], original_s3_key=job_kwargs["original_s3_key"]
    )
    await db_session.refresh(banner)

    replace_response = await client.post(
        f"/v1/admin/banners/{banner_id}/image",
        files={"file": ("new.jpg", _fake_jpeg_bytes(), "image/jpeg")},
        headers=headers,
    )
    assert replace_response.status_code == 200

    client_s3 = get_s3_client()
    old_objects = client_s3.list_objects_v2(Bucket=settings.s3_bucket, Prefix=old_prefix)
    assert not old_objects.get("Contents")

    await db_session.refresh(banner)
    new_prefix = banner.s3_key.rsplit("/", 1)[0] + "/"
    assert new_prefix != old_prefix
    new_objects = client_s3.list_objects_v2(Bucket=settings.s3_bucket, Prefix=new_prefix)
    assert new_objects.get("Contents")


@pytest.mark.asyncio
async def test_delete_banner_removes_s3_objects_and_db_row(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    created = await _create_banner(client, headers, title="Баннер")
    banner_id = created.json()["id"]

    banner = await db_session.get(Banner, uuid.UUID(banner_id))
    assert banner is not None
    prefix = banner.s3_key.rsplit("/", 1)[0] + "/"
    client_s3 = get_s3_client()
    before = client_s3.list_objects_v2(Bucket=settings.s3_bucket, Prefix=prefix)
    assert before.get("Contents")

    delete_response = await client.delete(f"/v1/admin/banners/{banner_id}", headers=headers)
    assert delete_response.status_code == 204

    assert await db_session.get(Banner, uuid.UUID(banner_id)) is None
    after = client_s3.list_objects_v2(Bucket=settings.s3_bucket, Prefix=prefix)
    assert not after.get("Contents")


@pytest.mark.asyncio
async def test_delete_banner_not_found(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)

    response = await client.delete(f"/v1/admin/banners/{uuid.uuid4()}", headers=headers)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "BANNER_NOT_FOUND"


@pytest.mark.asyncio
async def test_reorder_banners_sets_sort_order(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)

    banner_ids = []
    for i in range(3):
        response = await _create_banner(client, headers, title=f"Баннер {i}")
        banner_ids.append(response.json()["id"])

    reversed_order = list(reversed(banner_ids))
    reorder_response = await client.patch(
        "/v1/admin/banners/reorder",
        json={"banner_ids": reversed_order},
        headers=headers,
    )

    assert reorder_response.status_code == 200
    body = reorder_response.json()
    assert [b["id"] for b in body] == reversed_order
    assert [b["sort_order"] for b in body] == [0, 1, 2]

    public_list = await client.get("/v1/banners")
    assert [b["id"] for b in public_list.json()] == reversed_order


@pytest.mark.asyncio
async def test_reorder_rejects_mismatched_banner_ids(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    await _create_banner(client, headers, title="Баннер")

    response = await client.patch(
        "/v1/admin/banners/reorder",
        json={"banner_ids": [str(uuid.uuid4())]},
        headers=headers,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "BANNER_REORDER_MISMATCH"


@pytest.mark.asyncio
async def test_public_banners_ordered_and_only_active(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(db_session)
    first = await _create_banner(client, headers, title="Первый")
    second = await _create_banner(client, headers, title="Второй")
    assert first.status_code == 201 and second.status_code == 201

    response = await client.get("/v1/banners")
    assert response.status_code == 200
    body = response.json()
    assert [b["title"] for b in body] == ["Первый", "Второй"]
    assert "is_active" not in body[0]
