import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.cart import service as cart_service
from app.cart.dependencies import CartContext, get_cart_context
from app.cart.schemas import (
    AddCartItemRequest,
    ApplyPromoRequest,
    CartResponse,
    UpdateCartItemRequest,
)
from app.database import get_db

router = APIRouter(prefix="/cart", tags=["cart"])


@router.get("", response_model=CartResponse)
async def get_cart(
    db: Annotated[AsyncSession, Depends(get_db)],
    cart: Annotated[CartContext, Depends(get_cart_context)],
) -> CartResponse:
    return await cart_service.get_cart(db, cart.key)


@router.post("/items", response_model=CartResponse, status_code=status.HTTP_201_CREATED)
async def add_item(
    payload: AddCartItemRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    cart: Annotated[CartContext, Depends(get_cart_context)],
) -> CartResponse:
    return await cart_service.add_item(db, cart.key, variant_id=payload.variant_id, qty=payload.qty)


@router.patch("/items/{variant_id}", response_model=CartResponse)
async def update_item(
    variant_id: uuid.UUID,
    payload: UpdateCartItemRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    cart: Annotated[CartContext, Depends(get_cart_context)],
) -> CartResponse:
    return await cart_service.set_item_qty(db, cart.key, variant_id=variant_id, qty=payload.qty)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def clear_cart(cart: Annotated[CartContext, Depends(get_cart_context)]) -> None:
    await cart_service.clear_cart(cart.key)


@router.post("/promo", response_model=CartResponse)
async def apply_promo(
    payload: ApplyPromoRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    cart: Annotated[CartContext, Depends(get_cart_context)],
) -> CartResponse:
    return await cart_service.apply_promo(db, cart.key, code=payload.code)
