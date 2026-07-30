import socket
from urllib.parse import urlparse

from app.config import settings


def s3_reachable() -> bool:
    parsed = urlparse(settings.s3_endpoint_url)
    try:
        with socket.create_connection((parsed.hostname, parsed.port), timeout=1):
            return True
    except OSError:
        return False
