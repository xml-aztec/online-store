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


def _is_r2(endpoint_url: str) -> bool:
    return "r2.cloudflarestorage.com" in endpoint_url


def _region_for(endpoint_url: str) -> str:
    # Cloudflare's own boto3 example pins region to "auto" -- R2 doesn't have
    # AWS-style regions, and "auto" is what its SigV4 implementation expects.
    # MinIO/real S3 don't care either way, so this only special-cases R2.
    return "auto" if _is_r2(endpoint_url) else "us-east-1"


@lru_cache
def get_s3_client() -> S3Client:
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=BotoConfig(signature_version="s3v4"),
        region_name=_region_for(settings.s3_endpoint_url),
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
        # Regioned off the real API endpoint, not the public host being signed
        # for here -- e.g. for R2 that's pub-xxxx.r2.dev, which doesn't tell
        # you anything about which provider's signing rules apply.
        region_name=_region_for(settings.s3_endpoint_url),
    )


def ensure_bucket_exists() -> None:
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        client.create_bucket(Bucket=settings.s3_bucket)


def generate_presigned_url(key: str, *, expires_in: int = 3600) -> str:
    if _is_r2(settings.s3_endpoint_url):
        # R2's public bucket URL (an R2.dev subdomain or a custom domain) maps
        # 1:1 to a single bucket -- unlike MinIO's public endpoint, the bucket
        # name isn't part of the path, and it's a plain public read with no
        # signature check at all (S3 presigned-URL query params would just be
        # ignored). boto3's generate_presigned_url doesn't know this shape --
        # it always path-styles in the bucket name -- so build the URL by hand
        # instead of presigning against a client that assumes S3 semantics.
        return f"{settings.s3_public_url.rstrip('/')}/{key}"

    client = _get_presigning_s3_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires_in,
    )
