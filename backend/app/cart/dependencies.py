import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request, Response

from app.auth.models import User
from app.cart.service import CART_COOKIE_NAME, guest_cart_key, user_cart_key
from app.config import settings
from app.dependencies import get_optional_user


@dataclass
class CartContext:
    key: str
    user: User | None


async def get_cart_context(
    request: Request,
    response: Response,
    user: Annotated[User | None, Depends(get_optional_user)],
) -> CartContext:
    if user is not None:
        return CartContext(key=user_cart_key(user.id), user=user)

    cart_id = request.cookies.get(CART_COOKIE_NAME)
    if not cart_id:
        cart_id = str(uuid.uuid4())
        response.set_cookie(
            key=CART_COOKIE_NAME,
            value=cart_id,
            max_age=30 * 24 * 60 * 60,
            httponly=True,
            secure=settings.environment == "production",
            samesite="lax",
            path="/",
        )

    return CartContext(key=guest_cart_key(cart_id), user=None)
