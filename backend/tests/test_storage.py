import socket
from urllib.parse import urlparse

import httpx
import pytest

from app.config import settings
from app.core.storage import ensure_bucket_exists, generate_presigned_url, get_s3_client


def _s3_reachable() -> bool:
    parsed = urlparse(settings.s3_endpoint_url)
    try:
        with socket.create_connection((parsed.hostname, parsed.port), timeout=1):
            return True
    except OSError:
        return False


# CI's test-backend job only provisions postgres+redis (per Задача 0.3) -- these
# tests skip rather than fail when no MinIO/S3 endpoint is reachable.
pytestmark = pytest.mark.skipif(
    not _s3_reachable(), reason="S3/MinIO endpoint is not reachable in this environment"
)


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
