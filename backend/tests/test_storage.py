import httpx

from app.config import settings
from app.core.storage import ensure_bucket_exists, generate_presigned_url, get_s3_client


def test_ensure_bucket_exists_is_idempotent() -> None:
    ensure_bucket_exists()
    ensure_bucket_exists()

    get_s3_client().head_bucket(Bucket=settings.s3_bucket)


def test_presigned_url_roundtrip() -> None:
    ensure_bucket_exists()
    client = get_s3_client()
    client.put_object(Bucket=settings.s3_bucket, Key="healthcheck.txt", Body=b"hobbylife")

    url = generate_presigned_url("healthcheck.txt", expires_in=60)
    response = httpx.get(url)

    assert response.status_code == 200
    assert response.content == b"hobbylife"
