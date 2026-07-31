from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal


@dataclass
class ParsedImportRow:
    """One row = one product variant (ТЗ 11.1). Rows sharing (name, external_id)
    are grouped into a single product with multiple variants by the caller."""

    row_number: int
    external_id: str | None
    name: str | None
    category_path: str | None
    description: str | None
    sku: str | None
    options: dict[str, str]
    price: Decimal | None
    compare_at_price: Decimal | None
    stock_qty: int | None
    attributes: dict[str, str]
    photo_urls: list[str]
    errors: list[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return not self.errors


class ImportSource(ABC):
    """ТЗ 11.2: kept as an interface (not a single hardcoded parser) so a future
    CommerceML/1С source can be added without touching the upsert logic in
    app/imports/service.py."""

    @abstractmethod
    def parse(self, file_bytes: bytes) -> list[ParsedImportRow]: ...
