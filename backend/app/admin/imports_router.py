import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.queue import get_arq_pool
from app.core.storage import generate_presigned_url
from app.database import get_db
from app.dependencies import require_role
from app.imports import service as imports_service
from app.imports.models import ImportJob
from app.imports.schemas import ImportPreview, ImportStatusResponse, ImportUploadResponse

router = APIRouter(
    prefix="/admin", tags=["admin-imports"], dependencies=[Depends(require_role("admin"))]
)

_EMPTY_PREVIEW = ImportPreview(
    rows=[], total_rows=0, created_estimate=0, updated_estimate=0, error_count=0
)


def _job_to_status(job: ImportJob) -> ImportStatusResponse:
    return ImportStatusResponse(
        id=job.id,
        filename=job.filename,
        status=job.status,
        created_count=job.created_count,
        updated_count=job.updated_count,
        error_count=job.error_count,
        errors_report_url=(
            generate_presigned_url(job.errors_report_s3_key) if job.errors_report_s3_key else None
        ),
        preview=ImportPreview(**job.preview) if job.preview else _EMPTY_PREVIEW,
    )


@router.post("/imports/xlsx", response_model=ImportUploadResponse, status_code=201)
async def upload_import(
    db: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File()],
) -> ImportUploadResponse:
    contents = await file.read()
    job = await imports_service.upload_import(
        db, filename=file.filename or "import.xlsx", file_bytes=contents
    )
    return ImportUploadResponse(
        import_id=job.id, filename=job.filename, preview=ImportPreview(**job.preview)
    )


@router.post("/imports/{import_id}/apply", response_model=ImportStatusResponse)
async def apply_import(
    import_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]
) -> ImportStatusResponse:
    job = await imports_service.mark_import_processing(db, import_job_id=import_id)
    pool = await get_arq_pool()
    await pool.enqueue_job("apply_import_job", import_job_id=str(import_id))
    return _job_to_status(job)


# Must come before GET /imports/{import_id}: routes are matched in registration
# order, and "template" would otherwise be parsed as (and fail) a UUID path param.
@router.get("/imports/template")
async def download_template() -> Response:
    content = imports_service.generate_template()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=import-template.xlsx"},
    )


@router.get("/imports/{import_id}", response_model=ImportStatusResponse)
async def get_import_status(
    import_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]
) -> ImportStatusResponse:
    job = await imports_service.get_import(db, import_job_id=import_id)
    return _job_to_status(job)
