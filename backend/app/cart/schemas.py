import uuid
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class CartItemResponse(BaseModel):
    variant_id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    product_slug: str
    sku: str
    options: dict[str, Any]
    image_url: str | None
    price: Decimal
    qty: int
    line_total: Decimal
    is_available: bool
    available_qty: int


class CartResponse(BaseModel):
    items: list[CartItemResponse]
    subtotal: Decimal
    promo_code: str | None
    discount_amount: Decimal
    total: Decimal


class AddCartItemRequest(BaseModel):
    variant_id: uuid.UUID
    qty: int = Field(gt=0, le=99)


class UpdateCartItemRequest(BaseModel):
    qty: int = Field(ge=0, le=99)


class ApplyPromoRequest(BaseModel):
    code: str = Field(min_length=1)
