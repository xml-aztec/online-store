import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.queue import get_arq_pool
from app.orders import service as orders_service
from app.orders.models import Order
from app.payments.models import Payment, PaymentEvent
from app.payments.providers.base import ParsedWebhookEvent
from app.payments.providers.registry import get_provider

logger = logging.getLogger(__name__)


async def apply_payment_event(
    session: AsyncSession, *, provider_name: str, event: ParsedWebhookEvent
) -> None:
    # ТЗ 5.4: idempotency via payment_events -- if we've already recorded this
    # exact event_id, the webhook was delivered more than once; do nothing.
    existing = await session.scalar(
        select(PaymentEvent).where(
            PaymentEvent.provider == provider_name, PaymentEvent.event_id == event.event_id
        )
    )
    if existing is not None:
        return

    session.add(
        PaymentEvent(provider=provider_name, event_id=event.event_id, payload=event.raw_payload)
    )

    payment = await session.scalar(
        select(Payment).where(
            Payment.provider == provider_name, Payment.external_id == event.external_id
        )
    )
    if payment is None:
        await session.commit()
        return

    order = await session.get(Order, payment.order_id)

    if order is not None and event.amount != order.total:
        payment.status = "failed"
        payment.raw_payload = event.raw_payload
        await session.commit()
        logger.error(
            "payment amount mismatch: webhook_amount=%s order_total=%s payment_id=%s order_id=%s",
            event.amount,
            order.total,
            payment.id,
            order.id,
        )
        return

    payment.status = event.status
    payment.raw_payload = event.raw_payload
    await session.commit()

    if event.status == "succeeded":
        # ТЗ 5.4: respond to the webhook fast, do the heavier order transition
        # (+ its own email enqueue) in the background.
        pool = await get_arq_pool()
        await pool.enqueue_job("process_payment_succeeded", payment_id=str(payment.id))


async def refund_payment(
    session: AsyncSession, payment: Payment, *, changed_by: uuid.UUID | None
) -> Payment:
    provider = get_provider(payment.provider)
    await provider.refund(payment, payment.amount)

    payment.status = "refunded"

    order = await session.get(Order, payment.order_id)
    if order is not None:
        await orders_service.transition_status(
            session,
            order,
            to_status="refunded",
            changed_by=changed_by,
            comment="Возврат по платежу",
        )
    else:
        await session.commit()

    return payment
