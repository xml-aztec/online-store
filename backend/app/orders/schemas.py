from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, EmailStr


class AddressInput(BaseModel):
    city: str
    street: str
    building: str
    apartment: str | None = None
    postal_code: str | None = None
    comment: str | None = None


class CheckoutRequest(BaseModel):
    email: EmailStr
    phone: str
    full_name: str
    delivery_method: Literal["pickup", "courier"]
    address: AddressInput | None = None
    payment_method: Literal["cash_on_delivery", "online"]
    comment: str | None = None


class CheckoutResponse(BaseModel):
    number: str
    payment_url: str | None


class CheckoutConfigResponse(BaseModel):
    payment_methods: list[Literal["cash_on_delivery", "online"]]
    courier_delivery_cost: Decimal
    free_delivery_threshold: Decimal


class OrderItemPublic(BaseModel):
    product_name: str
    variant_options: dict[str, Any]
    sku: str
    unit_price: Decimal
    quantity: int
    line_total: Decimal


class OrderPublic(BaseModel):
    number: str
    status: str
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
    items: list[OrderItemPublic]


class OrderListItem(BaseModel):
    number: str
    status: str
    total: Decimal
    created_at: datetime


class OrderListResponse(BaseModel):
    items: list[OrderListItem]
    total: int
    page: int
    page_size: int
