import uuid
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class AdminCategoryCreate(BaseModel):
    name: str
    slug: str
    parent_id: uuid.UUID | None = None
    sort_order: int = 0


class AdminCategoryUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    parent_id: uuid.UUID | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class AdminCategoryPublic(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    parent_id: uuid.UUID | None
    sort_order: int
    is_active: bool


class AdminCategoryListResponse(BaseModel):
    items: list[AdminCategoryPublic]
    total: int
    page: int
    page_size: int


class AdminProductCreate(BaseModel):
    category_id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)


class AdminProductUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    attributes: dict[str, Any] | None = None
    is_active: bool | None = None


class AdminProductVariantCreate(BaseModel):
    sku: str
    options: dict[str, Any] = Field(default_factory=dict)
    price: Decimal
    compare_at_price: Decimal | None = None
    stock_qty: int = 0


class AdminProductVariantUpdate(BaseModel):
    sku: str | None = None
    options: dict[str, Any] | None = None
    price: Decimal | None = None
    compare_at_price: Decimal | None = None
    stock_qty: int | None = None
    is_active: bool | None = None


class AdminProductVariantPublic(BaseModel):
    id: uuid.UUID
    sku: str
    options: dict[str, Any]
    price: Decimal
    compare_at_price: Decimal | None
    stock_qty: int
    is_active: bool


class AdminProductImagePublic(BaseModel):
    id: uuid.UUID
    url: str
    thumbnail_url: str
    alt: str | None
    sort_order: int


class AdminProductListItem(BaseModel):
    id: uuid.UUID
    category_id: uuid.UUID
    name: str
    slug: str
    is_active: bool


class AdminProductListResponse(BaseModel):
    items: list[AdminProductListItem]
    total: int
    page: int
    page_size: int


class AdminProductDetail(BaseModel):
    id: uuid.UUID
    category_id: uuid.UUID
    name: str
    slug: str
    description: str | None
    attributes: dict[str, Any]
    is_active: bool
    variants: list[AdminProductVariantPublic]
    images: list[AdminProductImagePublic]


class BulkStatusRequest(BaseModel):
    product_ids: list[uuid.UUID]
    is_active: bool


class BulkStatusResponse(BaseModel):
    updated: int
