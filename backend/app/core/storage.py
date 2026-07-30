from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING
from urllib.parse import urlparse

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.config import settings

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client


@lru_cache
def get_s3_client() -> S3Client:
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=BotoConfig(signature_version="s3v4"),
        region_name="us-east-1",
    )


@lru_cache
def _get_presigning_s3_client() -> S3Client:
    # Presigned URLs must be signed against the browser-reachable endpoint, not
    # the internal Docker-network one get_s3_client() uses for the backend's own
    # uploads/reads: e.g. locally S3_ENDPOINT_URL is "http://minio:9000" (only
    # resolvable inside the compose network) while S3_PUBLIC_URL's origin is
    # "http://localhost:9000" (what the browser can actually reach). The
    # signature only needs to match the host the request actually arrives on.
    public_origin = urlparse(settings.s3_public_url)
    endpoint = f"{public_origin.scheme}://{public_origin.netloc}"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=BotoConfig(signature_version="s3v4"),
        region_name="us-east-1",
    )


def ensure_bucket_exists() -> None:
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        client.create_bucket(Bucket=settings.s3_bucket)


def generate_presigned_url(key: str, *, expires_in: int = 3600) -> str:
    client = _get_presigning_s3_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires_in,
    )
