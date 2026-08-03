from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel

ProductSort = Literal["price_asc", "price_desc", "newest", "popular"]


class CategoryNode(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    sort_order: int
    product_count: int = 0
    children: list[CategoryNode] = []


CategoryNode.model_rebuild()


class CategorySummary(BaseModel):
    id: uuid.UUID
    name: str
    slug: str


class ProductImagePublic(BaseModel):
    url: str
    thumbnail_url: str
    alt: str | None
    sort_order: int


class ProductVariantPublic(BaseModel):
    id: uuid.UUID
    sku: str
    options: dict[str, Any]
    price: Decimal
    compare_at_price: Decimal | None
    stock_qty: int
    is_active: bool
    is_available: bool


class ProductListItem(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    price_from: Decimal
    price_to: Decimal
    is_available: bool
    image_url: str | None
    # Non-personalized aggregates -- safe to bake into an SSR'd/cached response,
    # unlike anything user-specific (e.g. is_favorite), which stays client-fetched.
    discount_percent: int | None = None
    compare_at_price: Decimal | None = None
    stock_qty: int = 0
    rating_avg: float | None = None
    rating_count: int = 0


class ProductDetail(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    attributes: dict[str, Any]
    category: CategorySummary
    variants: list[ProductVariantPublic]
    images: list[ProductImagePublic]
    rating_avg: float | None = None
    rating_count: int = 0


class FacetsResponse(BaseModel):
    price_min: Decimal | None
    price_max: Decimal | None
    options: dict[str, list[str]]


class ProductListResponse(BaseModel):
    items: list[ProductListItem]
    total: int
    page: int
    page_size: int
    facets: FacetsResponse
