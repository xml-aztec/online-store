import asyncio
from decimal import Decimal
from typing import Any

import structlog
from sqlalchemy import select

from app.catalog.models import Category, Product, ProductVariant
from app.core.logging import configure_logging
from app.database import async_session_factory

logger = structlog.get_logger()

_BASE_ATTRIBUTES = {"материал": "пищевой пластик", "бренд": "HobbyLife", "страна": "Кыргызстан"}

_CATEGORIES: list[dict[str, str]] = [
    {"name": "Посуда и контейнеры", "slug": "posuda-i-kontejnery"},
    {"name": "Хранение и уборка", "slug": "hranenie-i-uborka"},
    {"name": "Детские товары", "slug": "detskie-tovary"},
]

_PRODUCTS: list[dict[str, Any]] = [
    {
        "category_slug": "posuda-i-kontejnery",
        "name": "Контейнер пищевой прямоугольный",
        "slug": "kontejner-pishchevoj-pryamougolnyj",
        "description": (
            "Герметичный контейнер для хранения продуктов. Можно использовать в морозилке и СВЧ."
        ),
        "attributes": {**_BASE_ATTRIBUTES, "назначение": "морозилка, СВЧ"},
        "variants": [
            {"volume": "0.5л", "color": "прозрачный", "price": Decimal("190.00"), "stock_qty": 40},
            {"volume": "1л", "color": "прозрачный", "price": Decimal("250.00"), "stock_qty": 35},
            {
                "volume": "1.5л",
                "color": "прозрачный",
                "price": Decimal("310.00"),
                "compare_at_price": Decimal("350.00"),
                "stock_qty": 25,
            },
        ],
    },
    {
        "category_slug": "posuda-i-kontejnery",
        "name": "Контейнер пищевой круглый",
        "slug": "kontejner-pishchevoj-kruglyj",
        "description": "Круглый контейнер для хранения продуктов с плотной крышкой.",
        "attributes": {**_BASE_ATTRIBUTES, "назначение": "морозилка, СВЧ"},
        "variants": [
            {"volume": "0.5л", "color": "белый", "price": Decimal("180.00"), "stock_qty": 40},
            {"volume": "1л", "color": "белый", "price": Decimal("240.00"), "stock_qty": 30},
            {"volume": "1.5л", "color": "белый", "price": Decimal("300.00"), "stock_qty": 20},
        ],
    },
    {
        "category_slug": "posuda-i-kontejnery",
        "name": "Ланч-бокс двухсекционный",
        "slug": "lanch-boks-dvuhsekcionnyj",
        "description": "Ланч-бокс с двумя отделениями для раздельного хранения еды.",
        "attributes": {**_BASE_ATTRIBUTES, "назначение": "СВЧ"},
        "variants": [
            {"volume": "0.5л", "color": "синий", "price": Decimal("270.00"), "stock_qty": 30},
            {
                "volume": "1л",
                "color": "синий",
                "price": Decimal("340.00"),
                "compare_at_price": Decimal("390.00"),
                "stock_qty": 22,
            },
        ],
    },
    {
        "category_slug": "posuda-i-kontejnery",
        "name": "Набор контейнеров для сыпучих продуктов",
        "slug": "nabor-kontejnerov-dlya-sypuchih-produktov",
        "description": "Контейнеры с завинчивающейся крышкой для круп, муки и сахара.",
        "attributes": {**_BASE_ATTRIBUTES, "назначение": "сыпучие продукты"},
        "variants": [
            {"volume": "1л", "color": "прозрачный", "price": Decimal("220.00"), "stock_qty": 35},
            {"volume": "1.5л", "color": "прозрачный", "price": Decimal("280.00"), "stock_qty": 28},
        ],
    },
    {
        "category_slug": "hranenie-i-uborka",
        "name": "Корзина для белья складная",
        "slug": "korzina-dlya-belya-skladnaya",
        "description": "Складная корзина для белья с ручками, экономит место при хранении.",
        "attributes": {**_BASE_ATTRIBUTES, "назначение": "хранение белья"},
        "variants": [
            {"volume": "25л", "color": "серый", "price": Decimal("450.00"), "stock_qty": 20},
            {"volume": "35л", "color": "серый", "price": Decimal("550.00"), "stock_qty": 18},
            {"volume": "45л", "color": "серый", "price": Decimal("650.00"), "stock_qty": 12},
        ],
    },
    {
        "category_slug": "hranenie-i-uborka",
        "name": "Корзина для игрушек",
        "slug": "korzina-dlya-igrushek",
        "description": "Лёгкая корзина для хранения игрушек с отверстиями для переноски.",
        "attributes": _BASE_ATTRIBUTES,
        "variants": [
            {"color": "розовый", "price": Decimal("380.00"), "stock_qty": 25},
            {"color": "голубой", "price": Decimal("380.00"), "stock_qty": 25},
            {"color": "зелёный", "price": Decimal("380.00"), "stock_qty": 20},
        ],
    },
    {
        "category_slug": "hranenie-i-uborka",
        "name": "Тазик хозяйственный",
        "slug": "tazik-hozyajstvennyj",
        "description": "Прочный хозяйственный тазик для стирки и хозяйственных нужд.",
        "attributes": _BASE_ATTRIBUTES,
        "variants": [
            {"volume": "5л", "color": "красный", "price": Decimal("150.00"), "stock_qty": 45},
            {"volume": "10л", "color": "красный", "price": Decimal("210.00"), "stock_qty": 35},
            {"volume": "15л", "color": "красный", "price": Decimal("270.00"), "stock_qty": 25},
        ],
    },
    {
        "category_slug": "hranenie-i-uborka",
        "name": "Органайзер для ванной настенный",
        "slug": "organajzer-dlya-vannoj-nastennyj",
        "description": "Настенный органайзер для бытовой химии и мелочей в ванной комнате.",
        "attributes": _BASE_ATTRIBUTES,
        "variants": [
            {"color": "белый", "price": Decimal("320.00"), "stock_qty": 18},
            {"color": "бежевый", "price": Decimal("320.00"), "stock_qty": 15},
        ],
    },
    {
        "category_slug": "detskie-tovary",
        "name": "Ванночка детская анатомическая",
        "slug": "vannochka-detskaya-anatomicheskaya",
        "description": "Анатомическая ванночка для купания новорождённых с поддержкой спинки.",
        "attributes": {**_BASE_ATTRIBUTES, "назначение": "купание детей"},
        "variants": [
            {"color": "голубой", "price": Decimal("890.00"), "stock_qty": 14},
            {"color": "розовый", "price": Decimal("890.00"), "stock_qty": 14},
            {
                "color": "белый",
                "price": Decimal("850.00"),
                "compare_at_price": Decimal("950.00"),
                "stock_qty": 10,
            },
        ],
    },
    {
        "category_slug": "detskie-tovary",
        "name": "Горшок детский",
        "slug": "gorshok-detskij",
        "description": "Устойчивый детский горшок с эргономичной формой.",
        "attributes": {**_BASE_ATTRIBUTES, "назначение": "приучение к горшку"},
        "variants": [
            {"color": "голубой", "price": Decimal("290.00"), "stock_qty": 30},
            {"color": "розовый", "price": Decimal("290.00"), "stock_qty": 30},
            {"color": "жёлтый", "price": Decimal("290.00"), "stock_qty": 22},
        ],
    },
]


async def seed() -> None:
    async with async_session_factory() as session:
        existing = await session.scalar(select(Product.id).limit(1))
        if existing is not None:
            logger.info("seed_skipped", reason="products already exist")
            return

        categories_by_slug: dict[str, Category] = {}
        for index, category_data in enumerate(_CATEGORIES):
            category = Category(sort_order=index, **category_data)
            session.add(category)
            categories_by_slug[category_data["slug"]] = category
        await session.flush()

        variant_count = 0
        for product_index, product_data in enumerate(_PRODUCTS, start=1):
            variants_data = product_data["variants"]
            product = Product(
                category_id=categories_by_slug[product_data["category_slug"]].id,
                name=product_data["name"],
                slug=product_data["slug"],
                description=product_data["description"],
                attributes=product_data["attributes"],
            )
            session.add(product)
            await session.flush()

            for variant_index, variant_data in enumerate(variants_data, start=1):
                options = {
                    key: variant_data[key] for key in ("volume", "color") if key in variant_data
                }
                session.add(
                    ProductVariant(
                        product_id=product.id,
                        sku=f"HL-{product_index:02d}-{variant_index:02d}",
                        options=options,
                        price=variant_data["price"],
                        compare_at_price=variant_data.get("compare_at_price"),
                        stock_qty=variant_data["stock_qty"],
                    )
                )
                variant_count += 1

        await session.commit()
        logger.info(
            "seed_completed",
            categories=len(_CATEGORIES),
            products=len(_PRODUCTS),
            variants=variant_count,
        )


if __name__ == "__main__":
    configure_logging()
    asyncio.run(seed())
