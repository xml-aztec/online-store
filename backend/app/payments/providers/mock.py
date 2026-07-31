import hashlib
import hmac
import uuid
from decimal import Decimal, InvalidOperation
from urllib.parse import quote

from fastapi import Request

from app.config import settings
from app.orders.models import Order
from app.payments.models import Payment
from app.payments.providers.base import (
    ParsedWebhookEvent,
    PaymentInfo,
    PaymentProvider,
    PaymentWebhookError,
)


class MockPaymentProvider(PaymentProvider):
    """ТЗ 5.4: no real gateway is contracted yet -- this is what the whole
    online-payment flow (checkout -> hosted page -> webhook -> paid) is built
    and tested against until a real provider (MBank/ELQR/card aggregator) lands.
    """

    name = "mock"

    async def create_payment(self, order: Order) -> PaymentInfo:
        external_id = str(uuid.uuid4())
        # Must be browser-reachable (through Caddy's /api prefix), not the
        # internal-only backend hostname -- same class of bug as the presigned
        # S3 URLs in Задача 2.3.
        payment_url = f"http://{settings.domain}/api/v1/payments/mock/{external_id}/page"
        return PaymentInfo(external_id=external_id, payment_url=payment_url)

    async def parse_webhook(self, request: Request) -> ParsedWebhookEvent:
        form = await request.form()
        event_id = str(form.get("event_id", ""))
        external_id = str(form.get("external_id", ""))
        status = str(form.get("status", ""))
        signature = str(form.get("signature", ""))

        try:
            amount = Decimal(str(form.get("amount", "")))
        except InvalidOperation as exc:
            raise PaymentWebhookError("invalid amount") from exc

        expected_signature = self._sign(
            event_id=event_id, external_id=external_id, status=status, amount=amount
        )
        if not signature or not hmac.compare_digest(signature, expected_signature):
            raise PaymentWebhookError("invalid signature")

        return ParsedWebhookEvent(
            event_id=event_id,
            external_id=external_id,
            status=status,
            amount=amount,
            raw_payload={
                "event_id": event_id,
                "external_id": external_id,
                "status": status,
                "amount": str(amount),
            },
        )

    async def refund(self, payment: Payment, amount: Decimal) -> None:
        # No external gateway to call -- a mock refund always "succeeds" locally.
        return None

    def _sign(self, *, event_id: str, external_id: str, status: str, amount: Decimal) -> str:
        secret = settings.payment_webhook_secret.encode()
        message = f"{event_id}|{external_id}|{status}|{amount}".encode()
        return hmac.new(secret, message, hashlib.sha256).hexdigest()

    def render_payment_page(
        self, *, external_id: str, amount: Decimal, order_number: str, email: str
    ) -> str:
        succeeded_event_id = str(uuid.uuid4())
        failed_event_id = str(uuid.uuid4())
        succeeded_signature = self._sign(
            event_id=succeeded_event_id, external_id=external_id, status="succeeded", amount=amount
        )
        failed_signature = self._sign(
            event_id=failed_event_id, external_id=external_id, status="failed", amount=amount
        )
        success_return = f"/checkout/success/{order_number}?email={quote(email)}"
        fail_return = f"/checkout/fail/{order_number}?email={quote(email)}"

        return f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Тестовая оплата — HobbyLife</title>
  <style>
    body {{ font-family: sans-serif; max-width: 480px; margin: 60px auto; text-align: center; }}
    form {{ display: inline-block; margin: 8px; }}
    .pay {{ background: #16a34a; }}
    .decline {{ background: #dc2626; }}
    button {{ padding: 12px 24px; color: #fff; border: none; border-radius: 6px; }}
  </style>
</head>
<body>
  <h1>Тестовая оплата — HobbyLife</h1>
  <p>Заказ {order_number}, сумма к оплате: {amount} сом</p>
  <form method="post" action="/api/v1/webhooks/payment/mock">
    <input type="hidden" name="event_id" value="{succeeded_event_id}">
    <input type="hidden" name="external_id" value="{external_id}">
    <input type="hidden" name="status" value="succeeded">
    <input type="hidden" name="amount" value="{amount}">
    <input type="hidden" name="signature" value="{succeeded_signature}">
    <input type="hidden" name="return_url" value="{success_return}">
    <button type="submit" class="pay">Оплатить</button>
  </form>
  <form method="post" action="/api/v1/webhooks/payment/mock">
    <input type="hidden" name="event_id" value="{failed_event_id}">
    <input type="hidden" name="external_id" value="{external_id}">
    <input type="hidden" name="status" value="failed">
    <input type="hidden" name="amount" value="{amount}">
    <input type="hidden" name="signature" value="{failed_signature}">
    <input type="hidden" name="return_url" value="{fail_return}">
    <button type="submit" class="decline">Отклонить</button>
  </form>
</body>
</html>"""
