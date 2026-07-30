import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.config import settings
from app.core.security import (
    TokenError,
    create_access_token,
    create_email_action_token,
    decode_access_token,
    decode_email_action_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    password_fingerprint,
    verify_password,
)


def test_hash_password_roundtrip() -> None:
    password_hash = hash_password("supersecret123")

    assert verify_password("supersecret123", password_hash)
    assert not verify_password("wrongpassword", password_hash)


def test_access_token_roundtrip() -> None:
    user_id = uuid.uuid4()
    token = create_access_token(user_id, "customer")

    payload = decode_access_token(token)

    assert payload.user_id == user_id
    assert payload.role == "customer"


def test_access_token_rejects_expired_token() -> None:
    expired_token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "role": "customer",
            "type": "access",
            "iat": datetime.now(UTC) - timedelta(minutes=20),
            "exp": datetime.now(UTC) - timedelta(minutes=5),
        },
        settings.jwt_secret_key,
        algorithm="HS256",
    )

    with pytest.raises(TokenError):
        decode_access_token(expired_token)


def test_access_token_rejects_wrong_token_type() -> None:
    email_token = create_email_action_token(
        user_id=uuid.uuid4(), purpose="email_verification", ttl=timedelta(hours=24)
    )

    with pytest.raises(TokenError):
        decode_access_token(email_token)


def test_refresh_token_hash_is_deterministic_and_not_reversible() -> None:
    raw = generate_refresh_token()

    assert hash_refresh_token(raw) == hash_refresh_token(raw)
    assert hash_refresh_token(raw) != raw


def test_email_action_token_roundtrip() -> None:
    user_id = uuid.uuid4()
    token = create_email_action_token(
        user_id=user_id, purpose="email_verification", ttl=timedelta(hours=24)
    )

    payload = decode_email_action_token(token, expected_purpose="email_verification")

    assert payload.user_id == user_id
    assert payload.purpose == "email_verification"


def test_email_action_token_rejects_wrong_purpose() -> None:
    token = create_email_action_token(
        user_id=uuid.uuid4(), purpose="email_verification", ttl=timedelta(hours=24)
    )

    with pytest.raises(TokenError):
        decode_email_action_token(token, expected_purpose="password_reset")


def test_password_reset_token_fingerprint_invalidated_by_password_change() -> None:
    user_id = uuid.uuid4()
    old_hash = hash_password("old-password-123")
    token = create_email_action_token(
        user_id=user_id, purpose="password_reset", ttl=timedelta(hours=1), password_hash=old_hash
    )

    payload = decode_email_action_token(token, expected_purpose="password_reset")
    new_hash = hash_password("new-password-456")

    assert payload.password_fingerprint == password_fingerprint(old_hash)
    assert payload.password_fingerprint != password_fingerprint(new_hash)
