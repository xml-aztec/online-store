from datetime import UTC, datetime, timedelta
from decimal import Decimal

import factory

from app.auth.models import Address, RefreshToken, User
from app.catalog.models import Category, Product, ProductImage, ProductVariant
from app.orders.models import Order, OrderItem, OrderStatusHistory, PromoCode
from app.payments.models import Payment, PaymentEvent

factory.Faker._DEFAULT_LOCALE = "ru_RU"


# factory.Factory (not SQLAlchemyModelFactory): builds plain model instances --
# async sessions can't use factory_boy's built-in synchronous persistence hooks.
# Persist explicitly: session.add(SomeFactory.build()); await session.flush()
class BaseFactory(factory.Factory):
    class Meta:
        abstract = True


# FK columns (user_id, product_id, order_id, ...) are intentionally not set here --
# the caller creates and flushes the parent row first, then passes its real id.


class UserFactory(BaseFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    full_name = factory.Faker("name")
    phone = factory.Faker("phone_number")
    role = "customer"
    is_active = True


class RefreshTokenFactory(BaseFactory):
    class Meta:
        model = RefreshToken

    token_hash = factory.Faker("sha256")
    expires_at = factory.LazyFunction(lambda: datetime.now(UTC) + timedelta(days=30))


class AddressFactory(BaseFactory):
    class Meta:
        model = Address

    city = "Бишкек"
    street = factory.Faker("street_name")
    building = factory.Sequence(lambda n: str(n + 1))
    is_default = False


class CategoryFactory(BaseFactory):
    class Meta:
        model = Category

    name = factory.Faker("word")
    slug = factory.Sequence(lambda n: f"category-{n}")
    sort_order = 0
    is_active = True


class ProductFactory(BaseFactory):
    class Meta:
        model = Product

    name = factory.Sequence(lambda n: f"Товар HobbyLife {n}")
    slug = factory.Sequence(lambda n: f"product-{n}")
    description = factory.Faker("sentence")
    attributes = factory.LazyFunction(dict)
    is_active = True


class ProductVariantFactory(BaseFactory):
    class Meta:
        model = ProductVariant

    sku = factory.Sequence(lambda n: f"SKU-{n:06d}")
    options = factory.LazyFunction(dict)
    price = Decimal("990.00")
    stock_qty = 10
    is_active = True


class ProductImageFactory(BaseFactory):
    class Meta:
        model = ProductImage

    s3_key = factory.Sequence(lambda n: f"products/image-{n}.webp")
    alt = factory.Faker("word")
    sort_order = 0


class OrderFactory(BaseFactory):
    class Meta:
        model = Order

    number = factory.Sequence(lambda n: f"ORD-20260101-{n:05d}")
    email = factory.Sequence(lambda n: f"customer{n}@example.com")
    phone = factory.Faker("phone_number")
    full_name = factory.Faker("name")
    status = "pending"
    payment_method = "cash_on_delivery"
    delivery_method = "pickup"
    subtotal = Decimal("0.00")
    total = Decimal("0.00")
    discount_amount = Decimal("0.00")


class OrderItemFactory(BaseFactory):
    class Meta:
        model = OrderItem

    product_name = factory.Sequence(lambda n: f"Товар {n}")
    variant_options = factory.LazyFunction(dict)
    sku = factory.Sequence(lambda n: f"SKU-{n:06d}")
    unit_price = Decimal("990.00")
    quantity = 1
    line_total = Decimal("990.00")


class OrderStatusHistoryFactory(BaseFactory):
    class Meta:
        model = OrderStatusHistory

    to_status = "pending"


class PromoCodeFactory(BaseFactory):
    class Meta:
        model = PromoCode

    code = factory.Sequence(lambda n: f"PROMO{n}")
    discount_type = "percent"
    discount_value = Decimal("10.00")
    used_count = 0
    is_active = True


class PaymentFactory(BaseFactory):
    class Meta:
        model = Payment

    provider = "mock"
    amount = Decimal("990.00")
    status = "created"


class PaymentEventFactory(BaseFactory):
    class Meta:
        model = PaymentEvent

    provider = "mock"
    event_id = factory.Faker("uuid4")
    payload = factory.LazyFunction(dict)
