import uuid
from datetime import datetime
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


class AdminUserPublic(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    role: str
    is_active: bool
    email_verified: bool
    created_at: datetime


class AdminUserListResponse(BaseModel):
    items: list[AdminUserPublic]
    total: int
    page: int
    page_size: int


class AdminUserUpdate(BaseModel):
    role: str | None = None
    is_active: bool | None = None


class AdminPromoCodeCreate(BaseModel):
    code: str
    discount_type: str
    discount_value: Decimal = Field(gt=0)
    min_order_total: Decimal | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_uses: int | None = None
    is_active: bool = True


class AdminPromoCodeUpdate(BaseModel):
    code: str | None = None
    discount_type: str | None = None
    discount_value: Decimal | None = Field(default=None, gt=0)
    min_order_total: Decimal | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_uses: int | None = None
    is_active: bool | None = None


class AdminPromoCodePublic(BaseModel):
    id: uuid.UUID
    code: str
    discount_type: str
    discount_value: Decimal
    min_order_total: Decimal | None
    starts_at: datetime | None
    ends_at: datetime | None
    max_uses: int | None
    used_count: int
    is_active: bool
    created_at: datetime


class AdminPromoCodeListResponse(BaseModel):
    items: list[AdminPromoCodePublic]
    total: int
    page: int
    page_size: int


class AdminOrderItemPublic(BaseModel):
    product_name: str
    variant_options: dict[str, Any]
    sku: str
    unit_price: Decimal
    quantity: int
    line_total: Decimal


class AdminOrderStatusHistoryPublic(BaseModel):
    from_status: str | None
    to_status: str
    changed_by: uuid.UUID | None
    comment: str | None
    created_at: datetime


class AdminOrderListItem(BaseModel):
    id: uuid.UUID
    number: str
    status: str
    email: str
    full_name: str
    total: Decimal
    created_at: datetime


class AdminOrderListResponse(BaseModel):
    items: list[AdminOrderListItem]
    total: int
    page: int
    page_size: int


class AdminOrderDetail(BaseModel):
    id: uuid.UUID
    number: str
    status: str
    email: str
    phone: str
    full_name: str
    payment_method: str
    delivery_method: str
    delivery_address: dict[str, Any] | None
    delivery_cost: Decimal
    subtotal: Decimal
    discount_amount: Decimal
    total: Decimal
    comment: str | None
    expires_at: datetime | None
    created_at: datetime
    allowed_transitions: list[str]
    items: list[AdminOrderItemPublic]
    status_history: list[AdminOrderStatusHistoryPublic]


class AdminOrderStatusUpdateRequest(BaseModel):
    to_status: str
    comment: str | None = None


class StatsPeriodResponse(BaseModel):
    orders_count: int
    revenue: Decimal


class TopProductResponse(BaseModel):
    product_name: str
    quantity_sold: int
    revenue: Decimal


class StatsSummaryResponse(BaseModel):
    last_7_days: StatsPeriodResponse
    last_30_days: StatsPeriodResponse
    top_products: list[TopProductResponse]
