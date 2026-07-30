import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import (
    AddressFactory,
    CategoryFactory,
    OrderFactory,
    OrderItemFactory,
    OrderStatusHistoryFactory,
    PaymentEventFactory,
    PaymentFactory,
    ProductFactory,
    ProductImageFactory,
    ProductVariantFactory,
    PromoCodeFactory,
    RefreshTokenFactory,
    UserFactory,
)


@pytest.mark.asyncio
async def test_every_model_factory_builds_and_persists(db_session: AsyncSession) -> None:
    user = UserFactory.build()
    db_session.add(user)
    await db_session.flush()

    db_session.add(RefreshTokenFactory.build(user_id=user.id))
    db_session.add(AddressFactory.build(user_id=user.id))

    category = CategoryFactory.build()
    db_session.add(category)
    await db_session.flush()

    product = ProductFactory.build(category_id=category.id)
    db_session.add(product)
    await db_session.flush()

    variant = ProductVariantFactory.build(product_id=product.id)
    db_session.add(variant)
    db_session.add(ProductImageFactory.build(product_id=product.id))
    await db_session.flush()

    promo = PromoCodeFactory.build()
    db_session.add(promo)
    await db_session.flush()

    order = OrderFactory.build(user_id=user.id, promo_code_id=promo.id)
    db_session.add(order)
    await db_session.flush()

    db_session.add(OrderItemFactory.build(order_id=order.id, variant_id=variant.id))
    db_session.add(OrderStatusHistoryFactory.build(order_id=order.id, changed_by=user.id))

    payment = PaymentFactory.build(order_id=order.id)
    db_session.add(payment)
    db_session.add(PaymentEventFactory.build())

    await db_session.flush()
