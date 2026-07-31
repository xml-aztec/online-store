from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.cart.dependencies import CartContext, get_cart_context
from app.database import get_db
from app.dependencies import get_current_user
from app.orders import service as orders_service
from app.orders.models import Order
from app.orders.schemas import (
    CheckoutRequest,
    CheckoutResponse,
    OrderItemPublic,
    OrderListItem,
    OrderListResponse,
    OrderPublic,
)

router = APIRouter(tags=["orders"])


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
    )


@router.post("/orders", response_model=CheckoutResponse, status_code=status.HTTP_201_CREATED)
async def checkout(
    payload: CheckoutRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    cart: Annotated[CartContext, Depends(get_cart_context)],
) -> CheckoutResponse:
    order, payment_url = await orders_service.create_order(
        db,
        cart_key=cart.key,
        user_id=cart.user.id if cart.user is not None else None,
        email=payload.email,
        phone=payload.phone,
        full_name=payload.full_name,
        delivery_method=payload.delivery_method,
        address=payload.address.model_dump() if payload.address is not None else None,
        payment_method=payload.payment_method,
        comment=payload.comment,
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
    return _order_to_public(order)
