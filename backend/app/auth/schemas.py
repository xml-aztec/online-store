import uuid
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, EmailStr, Field

if TYPE_CHECKING:
    from app.auth.models import User


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailRequest(BaseModel):
    token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class MessageResponse(BaseModel):
    message: str


class UserPublic(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    phone: str | None
    role: str
    is_active: bool
    email_verified: bool

    @classmethod
    def from_model(cls, user: "User") -> "UserPublic":
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            phone=user.phone,
            role=user.role,
            is_active=user.is_active,
            email_verified=user.email_verified_at is not None,
        )
