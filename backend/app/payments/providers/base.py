from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from fastapi import Request

from app.orders.models import Order
from app.payments.models import Payment


class PaymentWebhookError(Exception):
    """Raised by parse_webhook when the request can't be trusted (bad/missing signature)."""


@dataclass
class PaymentInfo:
    external_id: str
    payment_url: str | None = None
    qr_payload: str | None = None


@dataclass
class ParsedWebhookEvent:
    event_id: str
    external_id: str
    status: str
    amount: Decimal
    raw_payload: dict[str, Any] = field(default_factory=dict)


class PaymentProvider(ABC):
    name: str

    @abstractmethod
    async def create_payment(self, order: Order) -> PaymentInfo: ...

    @abstractmethod
    async def parse_webhook(self, request: Request) -> ParsedWebhookEvent: ...

    @abstractmethod
    async def refund(self, payment: Payment, amount: Decimal) -> None: ...
