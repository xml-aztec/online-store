import socket
from urllib.parse import urlparse

from app.config import settings


def _host_reachable(url: str) -> bool:
    parsed = urlparse(url)
    # parsed.port is None for scheme-only URLs (e.g. R2's "https://<id>.r2.
    # cloudflarestorage.com" with no explicit port) -- socket.create_connection
    # silently treats a None port as 0 and gets a real-but-misleading
    # ConnectionRefusedError, so every check here would report "unreachable"
    # even when the host is fine. Fall back to the scheme's default port.
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        with socket.create_connection((parsed.hostname, port), timeout=1):
            return True
    except OSError:
        return False


def s3_reachable() -> bool:
    """Internal MinIO endpoint (settings.s3_endpoint_url) -- what the backend
    itself uses for put/get/head. Reachable from inside the compose network."""
    return _host_reachable(settings.s3_endpoint_url)


def s3_public_url_reachable() -> bool:
    """Public endpoint (settings.s3_public_url) that presigned URLs are signed
    against -- what a browser (or a test on the host) can reach. Deliberately
    NOT reachable from inside a container (e.g. "localhost" there is the
    container itself) -- tests that fetch a presigned URL's content need this,
    not just s3_reachable()."""
    return _host_reachable(settings.s3_public_url)
