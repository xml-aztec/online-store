import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service as auth_service
from app.auth.models import User
from app.cart.dependencies import CartContext, get_cart_context
from app.config import settings
from app.core.rate_limit import ORDER_CREATE_RATE_LIMIT, check_rate_limit, client_ip
from app.database import get_db
from app.dependencies import get_current_user
from app.orders import service as orders_service
from app.orders.models import Order
from app.orders.schemas import (
    CheckoutConfigResponse,
    CheckoutRequest,
    CheckoutResponse,
    OrderItemPublic,
    OrderListItem,
    OrderListResponse,
    OrderPublic,
    OrderStatusHistoryPublic,
)

router = APIRouter(tags=["orders"])


@router.get("/checkout/config", response_model=CheckoutConfigResponse)
async def get_checkout_config() -> CheckoutConfigResponse:
    payment_methods: list[Literal["cash_on_delivery", "online"]] = ["cash_on_delivery"]
    if settings.payment_providers_list:
        payment_methods.append("online")

    return CheckoutConfigResponse(
        payment_methods=payment_methods,
        courier_delivery_cost=settings.courier_delivery_cost,
        free_delivery_threshold=settings.free_delivery_threshold,
    )


def _order_to_public(order: Order) -> OrderPublic:
    return OrderPublic(
        number=order.number,
        status=order.status,
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
        items=[
            OrderItemPublic(
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
            OrderStatusHistoryPublic(
                from_status=entry.from_status,
                to_status=entry.to_status,
                comment=entry.comment,
                created_at=entry.created_at,
            )
            for entry in order.status_history
        ],
    )


@router.post("/orders", response_model=CheckoutResponse, status_code=status.HTTP_201_CREATED)
async def checkout(
    payload: CheckoutRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    cart: Annotated[CartContext, Depends(get_cart_context)],
) -> CheckoutResponse:
    # ТЗ 5.5: 10 order creations / hour / IP.
    await check_rate_limit(f"ratelimit:order:{client_ip(request)}", *ORDER_CREATE_RATE_LIMIT)

    guest_account: User | None = None
    user_id: uuid.UUID | None
    if cart.user is not None:
        user_id = cart.user.id
    else:
        # ТЗ 4: a guest checkout may provision a passwordless account for this
        # email so the order is visible once they claim it -- but only when no
        # account exists yet (see get_or_create_guest_account's docstring for
        # why an existing email is never silently attached to).
        guest_account = await auth_service.get_or_create_guest_account(
            db, email=payload.email, full_name=payload.full_name, phone=payload.phone
        )
        user_id = guest_account.id if guest_account is not None else None

    order, payment_url = await orders_service.create_order(
        db,
        cart_key=cart.key,
        user_id=user_id,
        email=payload.email,
        phone=payload.phone,
        full_name=payload.full_name,
        delivery_method=payload.delivery_method,
        address=payload.address.model_dump() if payload.address is not None else None,
        payment_method=payload.payment_method,
        comment=payload.comment,
    )

    if guest_account is not None:
        await auth_service.enqueue_set_password_email(
            user_id=guest_account.id, order_number=order.number
        )

    return CheckoutResponse(number=order.number, payment_url=payment_url)


@router.get("/orders/{number}", response_model=OrderPublic)
async def get_guest_order(
    number: str,
    email: Annotated[str, Query()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderPublic:
    order = await orders_service.get_order_for_guest(db, number=number, email=email)
    return _order_to_public(order)


@router.get("/me/orders", response_model=OrderListResponse)
async def list_my_orders(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> OrderListResponse:
    orders, total = await orders_service.list_my_orders(
        db, user_id=user.id, page=page, page_size=page_size
    )
    return OrderListResponse(
        items=[
            OrderListItem(
                number=order.number,
                status=order.status,
                total=order.total,
                created_at=order.created_at,
                item_count=len(order.items),
                delivery_method=order.delivery_method,
            )
            for order in orders
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/me/orders/{number}", response_model=OrderPublic)
async def get_my_order(
    number: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> OrderPublic:
    order = await orders_service.get_my_order(db, user_id=user.id, number=number)
    return _order_to_public(order)


@router.post("/me/orders/{number}/cancel", response_model=OrderPublic)
async def cancel_my_order(
    number: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> OrderPublic:
    order = await orders_service.get_my_order(db, user_id=user.id, number=number)
    order = await orders_service.cancel_order(db, order, changed_by=user.id)
    # Same class of bug as admin_orders_router.py's status endpoint: cancel_order
    # commits a new status_history row, but with expire_on_commit=False the
    # already-loaded (pre-cancel) collection on this same object isn't refreshed.
    await db.refresh(order, attribute_names=["status_history"])
    return _order_to_public(order)
