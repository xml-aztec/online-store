import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TimestampedBase


class User(TimestampedBase):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('customer', 'manager', 'admin')", name="ck_users_role"),
        # Support the admin list's OFFSET/LIMIT pagination (sorted by
        # created_at) staying fast as the user base grows -- see
        # auth_service.list_users_admin.
        Index("ix_users_created_at", "created_at"),
    )

    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(nullable=True)
    full_name: Mapped[str | None] = mapped_column(nullable=True)
    phone: Mapped[str | None] = mapped_column(nullable=True)
    role: Mapped[str] = mapped_column(nullable=False, server_default="customer")
    is_active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # ТЗ 5.6: bound via a one-time /admin/telegram/link token, not settable
    # directly by the user -- see app/telegram/service.py::handle_start.
    telegram_chat_id: Mapped[str | None] = mapped_column(unique=True, nullable=True)

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    addresses: Mapped[list["Address"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class RefreshToken(TimestampedBase):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="refresh_tokens")


class Address(TimestampedBase):
    __tablename__ = "addresses"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str | None] = mapped_column(nullable=True)
    city: Mapped[str] = mapped_column(nullable=False)
    street: Mapped[str] = mapped_column(nullable=False)
    building: Mapped[str] = mapped_column(nullable=False)
    apartment: Mapped[str | None] = mapped_column(nullable=True)
    postal_code: Mapped[str | None] = mapped_column(nullable=True)
    comment: Mapped[str | None] = mapped_column(nullable=True)
    is_default: Mapped[bool] = mapped_column(nullable=False, server_default=text("false"))

    user: Mapped[User] = relationship(back_populates="addresses")
