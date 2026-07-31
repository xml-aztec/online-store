from typing import Any

from sqlalchemy import CheckConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TimestampedBase


class ImportJob(TimestampedBase):
    __tablename__ = "import_jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed')",
            name="ck_import_jobs_status",
        ),
    )

    filename: Mapped[str] = mapped_column(nullable=False)
    file_s3_key: Mapped[str] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(nullable=False, server_default="pending")
    preview: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    created_count: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    updated_count: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    error_count: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    errors_report_s3_key: Mapped[str | None] = mapped_column(nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(nullable=True)
