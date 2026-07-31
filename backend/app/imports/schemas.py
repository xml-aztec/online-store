import uuid
from typing import Any

from pydantic import BaseModel


class ImportPreview(BaseModel):
    rows: list[dict[str, Any]]
    total_rows: int
    created_estimate: int
    updated_estimate: int
    error_count: int


class ImportUploadResponse(BaseModel):
    import_id: uuid.UUID
    filename: str
    preview: ImportPreview


class ImportStatusResponse(BaseModel):
    id: uuid.UUID
    filename: str
    status: str
    created_count: int
    updated_count: int
    error_count: int
    errors_report_url: str | None
    preview: ImportPreview
