import re
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog import service as catalog_service
from app.catalog.schemas import (
    BannerPublic,
    CategoryNode,
    ProductDetail,
    ProductListResponse,
    ProductSort,
    PromoMessagePublic,
)
from app.core.storage import generate_presigned_url
from app.database import get_db
from app.exceptions import DomainError

router = APIRouter(tags=["catalog"])

_OPTIONS_PARAM_PATTERN = re.compile(r"^options\[(?P<key>[^\]]+)\]$")


def _parse_options(request: Request) -> dict[str, list[str]]:
    options: dict[str, list[str]] = {}
    for key, value in request.query_params.multi_items():
        match = _OPTIONS_PARAM_PATTERN.match(key)
        if match:
            options.setdefault(match.group("key"), []).append(value)
    return options


@router.get("/categories", response_model=list[CategoryNode])
async def list_categories(db: Annotated[AsyncSession, Depends(get_db)]) -> list[CategoryNode]:
    return await catalog_service.get_category_tree(db)


@router.get("/banners", response_model=list[BannerPublic])
async def list_banners(db: Annotated[AsyncSession, Depends(get_db)]) -> list[BannerPublic]:
    banners = await catalog_service.list_banners(db)
    return [
        BannerPublic(
            id=banner.id,
            title=banner.title,
            subtitle=banner.subtitle,
            link_url=banner.link_url,
            button_text=banner.button_text,
            image_url=generate_presigned_url(banner.s3_key),
            sort_order=banner.sort_order,
        )
        for banner in banners
    ]


@router.get("/promo-messages", response_model=list[PromoMessagePublic])
async def list_promo_messages(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PromoMessagePublic]:
    messages = await catalog_service.list_promo_messages(db)
    return [
        PromoMessagePublic(id=message.id, message=message.message, sort_order=message.sort_order)
        for message in messages
    ]


@router.get("/products", response_model=ProductListResponse)
async def list_products(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    category: str | None = None,
    q: str | None = None,
    price_min: Decimal | None = None,
    price_max: Decimal | None = None,
    in_stock: bool | None = None,
    on_sale: bool | None = None,
    sort: ProductSort = "newest",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 24,
) -> ProductListResponse:
    options = _parse_options(request)
    return await catalog_service.list_products(
        db,
        category_slug=category,
        q=q,
        price_min=price_min,
        price_max=price_max,
        in_stock=in_stock,
        on_sale=on_sale,
        options=options or None,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@router.get("/products/{slug}", response_model=ProductDetail)
async def get_product(slug: str, db: Annotated[AsyncSession, Depends(get_db)]) -> ProductDetail:
    product = await catalog_service.get_product_detail(db, slug=slug)
    if product is None:
        raise DomainError("Товар не найден", code="PRODUCT_NOT_FOUND", status_code=404)
    return product
