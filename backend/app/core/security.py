import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config import settings

_password_hasher = PasswordHasher()
_JWT_ALGORITHM = "HS256"


class TokenError(Exception):
    pass


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


@dataclass(frozen=True)
class AccessTokenPayload:
    user_id: uuid.UUID
    role: str


def create_access_token(user_id: uuid.UUID, role: str) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_access_token_ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str) -> AccessTokenPayload:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[_JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise TokenError("Невалидный или просроченный access-токен") from exc

    if payload.get("type") != "access":
        raise TokenError("Невалидный тип токена")

    return AccessTokenPayload(user_id=uuid.UUID(payload["sub"]), role=payload["role"])


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


EmailActionPurpose = Literal["email_verification", "password_reset"]


def password_fingerprint(password_hash: str | None) -> str:
    """Short fingerprint of the current password hash.

    Embedded in password-reset tokens so a token becomes invalid the moment the
    password actually changes -- giving the stateless JWT one-time-use semantics
    without a server-side revocation table.
    """
    return hashlib.sha256((password_hash or "").encode()).hexdigest()[:16]


def create_email_action_token(
    *,
    user_id: uuid.UUID,
    purpose: EmailActionPurpose,
    ttl: timedelta,
    password_hash: str | None = None,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "purpose": purpose,
        "iat": now,
        "exp": now + ttl,
    }
    if purpose == "password_reset":
        payload["pwd_fp"] = password_fingerprint(password_hash)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=_JWT_ALGORITHM)


@dataclass(frozen=True)
class EmailActionPayload:
    user_id: uuid.UUID
    purpose: EmailActionPurpose
    password_fingerprint: str | None


def decode_email_action_token(
    token: str, *, expected_purpose: EmailActionPurpose
) -> EmailActionPayload:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[_JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise TokenError("Невалидный или просроченный токен") from exc

    if payload.get("purpose") != expected_purpose:
        raise TokenError("Токен предназначен для другого действия")

    return EmailActionPayload(
        user_id=uuid.UUID(payload["sub"]),
        purpose=payload["purpose"],
        password_fingerprint=payload.get("pwd_fp"),
    )
