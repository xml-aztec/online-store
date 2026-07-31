from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.exceptions import DomainError
from app.orders.models import Order
from app.payments import service as payments_service
from app.payments.models import Payment
from app.payments.providers.base import PaymentWebhookError
from app.payments.providers.mock import MockPaymentProvider
from app.payments.providers.registry import get_provider

router = APIRouter(tags=["payments"])


@router.get("/payments/mock/{external_id}/page", response_class=HTMLResponse)
async def mock_payment_page(
    external_id: str, db: Annotated[AsyncSession, Depends(get_db)]
) -> HTMLResponse:
    payment = await db.scalar(
        select(Payment).where(Payment.provider == "mock", Payment.external_id == external_id)
    )
    if payment is None:
        raise DomainError("Платёж не найден", code="PAYMENT_NOT_FOUND", status_code=404)

    order = await db.get(Order, payment.order_id)
    if order is None:
        raise DomainError("Заказ не найден", code="ORDER_NOT_FOUND", status_code=404)

    provider = MockPaymentProvider()
    html = provider.render_payment_page(
        external_id=external_id,
        amount=payment.amount,
        order_number=order.number,
        email=order.email,
    )
    return HTMLResponse(html)


@router.post("/webhooks/payment/{provider}")
async def payment_webhook(
    provider: str, request: Request, db: Annotated[AsyncSession, Depends(get_db)]
) -> Response:
    provider_impl = get_provider(provider)

    try:
        event = await provider_impl.parse_webhook(request)
    except PaymentWebhookError as exc:
        raise DomainError(
            "Невалидная подпись webhook", code="INVALID_WEBHOOK_SIGNATURE", status_code=400
        ) from exc

    await payments_service.apply_payment_event(db, provider_name=provider, event=event)

    # The mock provider's own test page is a plain HTML form submitted by the
    # browser (there's no real gateway server redirecting the buyer back to
    # us), so it includes a return_url to get a nicer UX; a real provider's
    # server-to-server call never sends this and just gets a fast JSON ack.
    form = await request.form()
    return_url = form.get("return_url")
    if isinstance(return_url, str) and return_url:
        return RedirectResponse(url=return_url, status_code=303)

    return JSONResponse({"status": "ok"})
