import io
import uuid
from decimal import Decimal
from typing import Any

import httpx
import openpyxl
from slugify import slugify
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog import service as catalog_service
from app.catalog.models import Category, Product, ProductImage, ProductVariant
from app.config import settings
from app.core.queue import get_arq_pool
from app.core.storage import ensure_bucket_exists, get_s3_client
from app.exceptions import DomainError
from app.imports.models import ImportJob
from app.imports.sources.base import ParsedImportRow
from app.imports.sources.xlsx import HEADERS, XlsxImportSource

_XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_TEMPLATE_EXAMPLE_ROW = [
    "EXT-001",
    "Тазик хозяйственный",
    "Хранение и уборка/Тазики",
    "Пластиковый тазик для дома",
    "HL-99-01",
    "цвет=красный; объём=5л",
    "150.00",
    "",
    "40",
    "материал=пластик; бренд=HobbyLife",
    "",
]


async def _estimate_counts(
    session: AsyncSession, rows: list[ParsedImportRow]
) -> tuple[int, int, int]:
    valid_rows = [row for row in rows if row.is_valid]
    skus = {row.sku for row in valid_rows if row.sku}
    existing_skus: set[str] = set()
    if skus:
        result = await session.execute(
            select(ProductVariant.sku).where(ProductVariant.sku.in_(skus))
        )
        existing_skus = {row[0] for row in result.all()}

    updated = sum(1 for row in valid_rows if row.sku in existing_skus)
    created = len(valid_rows) - updated
    error_count = len(rows) - len(valid_rows)
    return created, updated, error_count


def _row_preview(row: ParsedImportRow) -> dict[str, Any]:
    return {
        "row_number": row.row_number,
        "name": row.name,
        "sku": row.sku,
        "price": str(row.price) if row.price is not None else None,
        "stock_qty": row.stock_qty,
        "errors": row.errors,
    }


async def upload_import(session: AsyncSession, *, filename: str, file_bytes: bytes) -> ImportJob:
    rows = XlsxImportSource().parse(file_bytes)

    ensure_bucket_exists()
    job_id = uuid.uuid4()
    file_key = f"imports/{job_id}/source.xlsx"
    get_s3_client().put_object(
        Bucket=settings.s3_bucket, Key=file_key, Body=file_bytes, ContentType=_XLSX_CONTENT_TYPE
    )

    created_estimate, updated_estimate, error_count = await _estimate_counts(session, rows)

    job = ImportJob(
        id=job_id,
        filename=filename,
        file_s3_key=file_key,
        status="pending",
        preview={
            "rows": [_row_preview(row) for row in rows[:20]],
            "total_rows": len(rows),
            "created_estimate": created_estimate,
            "updated_estimate": updated_estimate,
            "error_count": error_count,
        },
    )
    session.add(job)
    await session.commit()
    return job


async def get_import(session: AsyncSession, *, import_job_id: uuid.UUID) -> ImportJob:
    job = await session.get(ImportJob, import_job_id)
    if job is None:
        raise DomainError("Импорт не найден", code="IMPORT_NOT_FOUND", status_code=404)
    return job


async def mark_import_processing(session: AsyncSession, *, import_job_id: uuid.UUID) -> ImportJob:
    job = await get_import(session, import_job_id=import_job_id)
    if job.status != "pending":
        raise DomainError(
            "Импорт уже запущен или завершён", code="IMPORT_ALREADY_STARTED", status_code=409
        )
    job.status = "processing"
    await session.commit()
    return job


def generate_template() -> bytes:
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    assert sheet is not None
    sheet.title = "Импорт"
    sheet.append(HEADERS)
    sheet.append(_TEMPLATE_EXAMPLE_ROW)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


async def _unique_slug(
    session: AsyncSession, model: type[Category] | type[Product], name: str
) -> str:
    base = slugify(name) or "item"
    candidate = base
    suffix = 1
    column = model.slug
    while await session.scalar(select(model.id).where(column == candidate)):
        suffix += 1
        candidate = f"{base}-{suffix}"
    return candidate


async def _resolve_category_path(session: AsyncSession, path: str) -> Category:
    segments = [segment.strip() for segment in path.split("/") if segment.strip()]
    parent_id: uuid.UUID | None = None
    category: Category | None = None

    # ТЗ 4: max 3 levels of category nesting. The path is resolved top-down from
    # a root (parent_id starts at None), so segment count *is* the resulting
    # depth -- no need to separately walk any already-existing chain.
    if len(segments) > catalog_service.MAX_CATEGORY_DEPTH:
        raise DomainError(
            f"Слишком глубокий путь категории (максимум "
            f"{catalog_service.MAX_CATEGORY_DEPTH} уровня): «{path}»",
            code="CATEGORY_TOO_DEEP",
            status_code=422,
        )

    for segment in segments:
        category = await session.scalar(
            select(Category).where(Category.name == segment, Category.parent_id == parent_id)
        )
        if category is None:
            category = Category(
                name=segment,
                slug=await _unique_slug(session, Category, segment),
                parent_id=parent_id,
            )
            session.add(category)
            await session.flush()
        parent_id = category.id

    if category is None:
        raise DomainError(
            "Не указана категория", code="IMPORT_INVALID_CATEGORY", status_code=422
        )
    return category


async def _resolve_product(
    session: AsyncSession,
    *,
    external_id: str | None,
    name: str,
    category: Category,
    description: str | None,
    attributes: dict[str, str],
) -> tuple[Product, bool]:
    product: Product | None = None
    if external_id:
        product = await session.scalar(select(Product).where(Product.external_id == external_id))

    is_new = product is None
    if product is None:
        product = Product(
            external_id=external_id,
            category_id=category.id,
            name=name,
            slug=await _unique_slug(session, Product, name),
            description=description,
            attributes=dict(attributes),
        )
        session.add(product)
        await session.flush()
    else:
        product.name = name
        product.category_id = category.id
        product.description = description
        product.attributes = dict(attributes)

    return product, is_new


async def _resolve_variant(
    session: AsyncSession,
    *,
    product: Product,
    sku: str,
    options: dict[str, str],
    price: Decimal,
    compare_at_price: Decimal | None,
    stock_qty: int,
) -> tuple[ProductVariant, bool]:
    variant = await session.scalar(select(ProductVariant).where(ProductVariant.sku == sku))
    is_new = variant is None

    if variant is None:
        variant = ProductVariant(
            product_id=product.id,
            sku=sku,
            options=dict(options),
            price=price,
            compare_at_price=compare_at_price,
            stock_qty=stock_qty,
        )
        session.add(variant)
    else:
        variant.product_id = product.id
        variant.options = dict(options)
        variant.price = price
        variant.compare_at_price = compare_at_price
        variant.stock_qty = stock_qty

    return variant, is_new


async def _attach_photos(session: AsyncSession, *, product: Product, photo_urls: list[str]) -> None:
    if not photo_urls:
        return

    ensure_bucket_exists()
    s3_client = get_s3_client()
    pool = await get_arq_pool()
    sort_order = 0

    async with httpx.AsyncClient(timeout=15.0) as client:
        for url in photo_urls:
            try:
                response = await client.get(url)
                response.raise_for_status()
            except httpx.HTTPError:
                # A broken photo URL shouldn't fail the whole import row.
                continue

            content_type = response.headers.get("content-type", "")
            if not content_type.startswith("image/"):
                continue

            key = f"products/{product.id}/{uuid.uuid4().hex}/original"
            s3_client.put_object(
                Bucket=settings.s3_bucket, Key=key, Body=response.content, ContentType=content_type
            )

            image = ProductImage(product_id=product.id, s3_key=key, sort_order=sort_order)
            session.add(image)
            await session.flush()
            sort_order += 1

            await pool.enqueue_job(
                "process_product_image", image_id=str(image.id), original_s3_key=key
            )


def _generate_error_report(errors: list[tuple[ParsedImportRow, str]]) -> bytes:
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    assert sheet is not None
    sheet.title = "Ошибки"
    sheet.append(["Строка", "Название", "SKU", "Ошибка"])
    for row, message in errors:
        sheet.append([row.row_number, row.name or "", row.sku or "", message])

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


async def apply_import(session: AsyncSession, *, import_job_id: uuid.UUID) -> None:
    job = await session.get(ImportJob, import_job_id)
    if job is None:
        return

    try:
        file_bytes = get_s3_client().get_object(Bucket=settings.s3_bucket, Key=job.file_s3_key)[
            "Body"
        ].read()
        rows = XlsxImportSource().parse(file_bytes)
    except Exception as exc:
        job.status = "failed"
        job.failure_reason = str(exc)
        await session.commit()
        return

    created_count = 0
    updated_count = 0
    error_rows: list[tuple[ParsedImportRow, str]] = []

    groups: dict[tuple[str, str], list[ParsedImportRow]] = {}
    for row in rows:
        if not row.is_valid:
            error_rows.append((row, "; ".join(row.errors)))
            continue
        groups.setdefault((row.name or "", row.external_id or ""), []).append(row)

    for (name, external_id), group_rows in groups.items():
        try:
            category = await _resolve_category_path(session, group_rows[0].category_path or "")
            product, product_is_new = await _resolve_product(
                session,
                external_id=external_id or None,
                name=name,
                category=category,
                description=group_rows[0].description,
                attributes=group_rows[0].attributes,
            )

            photo_urls: list[str] = []
            for row in group_rows:
                for url in row.photo_urls:
                    if url not in photo_urls:
                        photo_urls.append(url)

            for row in group_rows:
                assert row.sku is not None
                assert row.price is not None
                _variant, variant_is_new = await _resolve_variant(
                    session,
                    product=product,
                    sku=row.sku,
                    options=row.options,
                    price=row.price,
                    compare_at_price=row.compare_at_price,
                    stock_qty=row.stock_qty or 0,
                )
                if variant_is_new:
                    created_count += 1
                else:
                    updated_count += 1

            await session.commit()

            # Only for newly-created products -- re-importing the same file
            # repeatedly must not keep re-downloading/duplicating photos, and
            # ProductImage doesn't track a source URL to dedupe against.
            if product_is_new and photo_urls:
                await _attach_photos(session, product=product, photo_urls=photo_urls)
                await session.commit()

        except Exception as exc:
            await session.rollback()
            for row in group_rows:
                error_rows.append((row, f"Ошибка применения: {exc}"))

    errors_report_key: str | None = None
    if error_rows:
        report_bytes = _generate_error_report(error_rows)
        errors_report_key = f"imports/{job.id}/errors.xlsx"
        get_s3_client().put_object(
            Bucket=settings.s3_bucket,
            Key=errors_report_key,
            Body=report_bytes,
            ContentType=_XLSX_CONTENT_TYPE,
        )

    job.status = "completed"
    job.created_count = created_count
    job.updated_count = updated_count
    job.error_count = len(error_rows)
    job.errors_report_s3_key = errors_report_key
    await session.commit()
