import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.schemas import (
    AdminOrderDetail,
    AdminOrderItemPublic,
    AdminOrderListItem,
    AdminOrderListResponse,
    AdminOrderStatusCountsResponse,
    AdminOrderStatusHistoryPublic,
    AdminOrderStatusUpdateRequest,
    StatsPeriodResponse,
    StatsSummaryResponse,
    TopProductResponse,
)
from app.auth.models import User
from app.database import get_db
from app.dependencies import require_role
from app.exceptions import DomainError
from app.orders import service as orders_service
from app.orders.models import Order
from app.payments.models import Payment
from app.payments.service import refund_payment

router = APIRouter(
    prefix="/admin", tags=["admin-orders"], dependencies=[Depends(require_role("manager", "admin"))]
)


def _order_to_list_item(order: Order) -> AdminOrderListItem:
    return AdminOrderListItem(
        id=order.id,
        number=order.number,
        status=order.status,
        email=order.email,
        full_name=order.full_name,
        total=order.total,
        created_at=order.created_at,
    )


def _order_to_detail(order: Order) -> AdminOrderDetail:
    return AdminOrderDetail(
        id=order.id,
        number=order.number,
        status=order.status,
        email=order.email,
        phone=order.phone,
        full_name=order.full_name,
        payment_method=order.payment_method,
        delivery_method=order.delivery_method,
        delivery_address=order.delivery_address,
        delivery_cost=order.delivery_cost,
        subtotal=order.subtotal,
        discount_amount=order.discount_amount,
        total=order.total,
        comment=order.comment,
        expires_at=order.expires_at,
        created_at=order.created_at,
        allowed_transitions=orders_service.manually_allowed_transitions(order.status),
        items=[
            AdminOrderItemPublic(
                product_name=item.product_name,
                variant_options=item.variant_options,
                sku=item.sku,
                unit_price=item.unit_price,
                quantity=item.quantity,
                line_total=item.line_total,
            )
            for item in order.items
        ],
        status_history=[
            AdminOrderStatusHistoryPublic(
                from_status=entry.from_status,
                to_status=entry.to_status,
                changed_by=entry.changed_by,
                comment=entry.comment,
                created_at=entry.created_at,
            )
            for entry in order.status_history
        ],
    )


@router.get("/orders/status-counts", response_model=AdminOrderStatusCountsResponse)
async def get_order_status_counts(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminOrderStatusCountsResponse:
    counts = await orders_service.count_orders_by_status(db)
    return AdminOrderStatusCountsResponse(counts=counts)


@router.get("/orders", response_model=AdminOrderListResponse)
async def list_orders(
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Annotated[list[str] | None, Query(alias="status")] = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 24,
) -> AdminOrderListResponse:
    orders, total = await orders_service.list_orders_admin(
        db,
        status_filter=status_filter,
        date_from=date_from,
        date_to=date_to,
        search=search,
        page=page,
        page_size=page_size,
    )
    return AdminOrderListResponse(
        items=[_order_to_list_item(order) for order in orders],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/orders/{order_id}", response_model=AdminOrderDetail)
async def get_order(
    order_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]
) -> AdminOrderDetail:
    order = await orders_service.get_order_admin(db, order_id=order_id)
    return _order_to_detail(order)


@router.post("/orders/{order_id}/status", response_model=AdminOrderDetail)
async def update_order_status(
    order_id: uuid.UUID,
    payload: AdminOrderStatusUpdateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("manager", "admin"))],
) -> AdminOrderDetail:
    order = await orders_service.get_order_admin(db, order_id=order_id)
    order = await orders_service.transition_status(
        db, order, to_status=payload.to_status, changed_by=user.id, comment=payload.comment
    )
    # transition_status adds a new status_history row and commits, but with
    # expire_on_commit=False the already-loaded (empty, from the query above)
    # status_history collection on this same in-session object isn't
    # automatically refreshed -- reload it explicitly.
    await db.refresh(order, attribute_names=["status_history"])
    return _order_to_detail(order)


@router.post(
    "/orders/{order_id}/refund",
    response_model=AdminOrderDetail,
    dependencies=[Depends(require_role("admin"))],
)
async def refund_order(
    order_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> AdminOrderDetail:
    order = await orders_service.get_order_admin(db, order_id=order_id)

    payment = await db.scalar(
        select(Payment)
        .where(Payment.order_id == order.id, Payment.status == "succeeded")
        .order_by(Payment.created_at.desc())
    )
    if payment is None:
        raise DomainError(
            "У заказа нет успешного платежа для возврата",
            code="PAYMENT_NOT_FOUND",
            status_code=404,
        )

    await refund_payment(db, payment, changed_by=user.id)
    await db.refresh(order, attribute_names=["status_history"])
    return _order_to_detail(order)


@router.get("/stats/summary", response_model=StatsSummaryResponse)
async def get_stats_summary(db: Annotated[AsyncSession, Depends(get_db)]) -> StatsSummaryResponse:
    stats = await orders_service.get_stats_summary(db)
    return StatsSummaryResponse(
        last_7_days=StatsPeriodResponse(
            orders_count=stats.last_7_days.orders_count, revenue=stats.last_7_days.revenue
        ),
        last_30_days=StatsPeriodResponse(
            orders_count=stats.last_30_days.orders_count, revenue=stats.last_30_days.revenue
        ),
        prev_7_days=StatsPeriodResponse(
            orders_count=stats.prev_7_days.orders_count, revenue=stats.prev_7_days.revenue
        ),
        prev_30_days=StatsPeriodResponse(
            orders_count=stats.prev_30_days.orders_count, revenue=stats.prev_30_days.revenue
        ),
        top_products=[
            TopProductResponse(
                product_name=product.product_name,
                quantity_sold=product.quantity_sold,
                revenue=product.revenue,
            )
            for product in stats.top_products
        ],
    )
