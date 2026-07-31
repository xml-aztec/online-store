import io
from decimal import Decimal, InvalidOperation
from typing import Any

import openpyxl

from app.imports.sources.base import ImportSource, ParsedImportRow

HEADERS = [
    "external_id",
    "Название",
    "Категория",
    "Описание",
    "SKU",
    "Опции",
    "Цена",
    "Старая цена",
    "Остаток",
    "Атрибуты",
    "Фото",
]


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _parse_kv_pairs(value: Any) -> dict[str, str]:
    text = _clean_str(value)
    if not text:
        return {}
    pairs: dict[str, str] = {}
    for chunk in text.split(";"):
        chunk = chunk.strip()
        if not chunk or "=" not in chunk:
            continue
        key, _, val = chunk.partition("=")
        key = key.strip()
        val = val.strip()
        if key:
            pairs[key] = val
    return pairs


def _parse_urls(value: Any) -> list[str]:
    text = _clean_str(value)
    if not text:
        return []
    return [url.strip() for url in text.split(",") if url.strip()]


def _parse_decimal(
    value: Any, *, field_name: str, errors: list[str], required: bool = True
) -> Decimal | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            errors.append(f"Не указано поле «{field_name}»")
        return None
    try:
        return Decimal(str(value).strip().replace(",", "."))
    except (InvalidOperation, ValueError):
        errors.append(f"Некорректное значение в поле «{field_name}»: {value!r}")
        return None


def _parse_int(
    value: Any, *, field_name: str, errors: list[str], required: bool = True
) -> int | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            errors.append(f"Не указано поле «{field_name}»")
        return None
    try:
        return int(float(str(value).strip().replace(",", ".")))
    except ValueError:
        errors.append(f"Некорректное значение в поле «{field_name}»: {value!r}")
        return None


class XlsxImportSource(ImportSource):
    def parse(self, file_bytes: bytes) -> list[ParsedImportRow]:
        workbook = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
        sheet = workbook.active
        if sheet is None:
            return []

        rows: list[ParsedImportRow] = []
        for row_number, raw_row in enumerate(
            sheet.iter_rows(min_row=2, values_only=True), start=2
        ):
            if raw_row is None or all(cell is None for cell in raw_row):
                continue
            rows.append(self._parse_row(row_number, raw_row))
        return rows

    def _parse_row(self, row_number: int, raw_row: tuple[Any, ...]) -> ParsedImportRow:
        values = dict(zip(HEADERS, raw_row, strict=False))
        errors: list[str] = []

        external_id = _clean_str(values.get("external_id"))
        name = _clean_str(values.get("Название"))
        category_path = _clean_str(values.get("Категория"))
        description = _clean_str(values.get("Описание"))
        sku = _clean_str(values.get("SKU"))
        options = _parse_kv_pairs(values.get("Опции"))
        attributes = _parse_kv_pairs(values.get("Атрибуты"))
        photo_urls = _parse_urls(values.get("Фото"))

        if not name:
            errors.append("Не указано название товара")
        if not sku:
            errors.append("Не указан SKU")
        if not category_path:
            errors.append("Не указана категория")

        price = _parse_decimal(values.get("Цена"), field_name="Цена", errors=errors)
        compare_at_price = _parse_decimal(
            values.get("Старая цена"), field_name="Старая цена", errors=errors, required=False
        )
        stock_qty = _parse_int(values.get("Остаток"), field_name="Остаток", errors=errors)

        return ParsedImportRow(
            row_number=row_number,
            external_id=external_id,
            name=name,
            category_path=category_path,
            description=description,
            sku=sku,
            options=options,
            price=price,
            compare_at_price=compare_at_price,
            stock_qty=stock_qty,
            attributes=attributes,
            photo_urls=photo_urls,
            errors=errors,
        )
