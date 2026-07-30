import json
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import ColumnElement, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Category, Product, ProductImage, ProductVariant
from app.catalog.schemas import (
    CategoryNode,
    CategorySummary,
    FacetsResponse,
    ProductDetail,
    ProductImagePublic,
    ProductListItem,
    ProductListResponse,
    ProductSort,
    ProductVariantPublic,
)
from app.core.redis import get_redis
from app.core.storage import generate_presigned_url
from app.orders.models import OrderItem

_CATEGORY_TREE_CACHE_KEY = "catalog:categories:tree"
_CATEGORY_TREE_CACHE_TTL = 300
# word_similarity (not similarity): matches the query against the best-matching word
# within the name, so a typo in one word isn't diluted by other words in a longer name.
_TRIGRAM_SIMILARITY_THRESHOLD = 0.3

_EMPTY_FACETS = FacetsResponse(price_min=None, price_max=None, options={})


async def get_category_tree(session: AsyncSession) -> list[CategoryNode]:
    redis = get_redis()
    cached = await redis.get(_CATEGORY_TREE_CACHE_KEY)
    if cached is not None:
        return [CategoryNode.model_validate(item) for item in json.loads(cached)]

    tree = await _build_category_tree(session)

    await redis.set(
        _CATEGORY_TREE_CACHE_KEY,
        json.dumps([node.model_dump(mode="json") for node in tree]),
        ex=_CATEGORY_TREE_CACHE_TTL,
    )
    return tree


async def invalidate_category_cache() -> None:
    redis = get_redis()
    await redis.delete(_CATEGORY_TREE_CACHE_KEY)


async def _build_category_tree(session: AsyncSession) -> list[CategoryNode]:
    categories = (
        await session.scalars(
            select(Category).where(Category.is_active.is_(True)).order_by(Category.sort_order)
        )
    ).all()

    nodes: dict[uuid.UUID, CategoryNode] = {
        category.id: CategoryNode(
            id=category.id, name=category.name, slug=category.slug, sort_order=category.sort_order
        )
        for category in categories
    }

    roots: list[CategoryNode] = []
    for category in categories:
        node = nodes[category.id]
        if category.parent_id is not None and category.parent_id in nodes:
            nodes[category.parent_id].children.append(node)
        else:
            roots.append(node)

    return roots


def flatten_category_ids(tree: list[CategoryNode], slug: str) -> list[uuid.UUID] | None:
    for node in tree:
        if node.slug == slug:
            return _collect_ids(node)
        found = flatten_category_ids(node.children, slug)
        if found is not None:
            return found
    return None


def _collect_ids(node: CategoryNode) -> list[uuid.UUID]:
    ids = [node.id]
    for child in node.children:
        ids.extend(_collect_ids(child))
    return ids


async def list_products(
    session: AsyncSession,
    *,
    category_slug: str | None,
    q: str | None,
    price_min: Decimal | None,
    price_max: Decimal | None,
    options: dict[str, list[str]] | None,
    sort: ProductSort,
    page: int,
    page_size: int,
) -> ProductListResponse:
    category_ids: list[uuid.UUID] | None = None
    if category_slug is not None:
        tree = await get_category_tree(session)
        category_ids = flatten_category_ids(tree, category_slug)
        if category_ids is None:
            return ProductListResponse(
                items=[], total=0, page=page, page_size=page_size, facets=_EMPTY_FACETS
            )

    variant_conditions: list[ColumnElement[bool]] = [ProductVariant.is_active.is_(True)]
    if price_min is not None:
        variant_conditions.append(ProductVariant.price >= price_min)
    if price_max is not None:
        variant_conditions.append(ProductVariant.price <= price_max)
    for key, values in (options or {}).items():
        variant_conditions.append(
            or_(*(ProductVariant.options[key].astext == value for value in values))
        )

    product_conditions: list[ColumnElement[bool]] = [
        Product.is_active.is_(True),
        Product.deleted_at.is_(None),
    ]
    if category_ids is not None:
        product_conditions.append(Product.category_id.in_(category_ids))
    if q:
        tsquery = func.plainto_tsquery("russian", q)
        product_conditions.append(
            or_(
                Product.search_vector.op("@@")(tsquery),
                func.word_similarity(q, Product.name) > _TRIGRAM_SIMILARITY_THRESHOLD,
            )
        )

    variant_agg = (
        select(
            ProductVariant.product_id.label("product_id"),
            func.min(ProductVariant.price).label("price_from"),
            func.max(ProductVariant.price).label("price_to"),
            func.bool_or(ProductVariant.stock_qty > 0).label("is_available"),
        )
        .where(*variant_conditions)
        .group_by(ProductVariant.product_id)
        .subquery()
    )

    base_query = (
        select(
            Product, variant_agg.c.price_from, variant_agg.c.price_to, variant_agg.c.is_available
        )
        .join(variant_agg, variant_agg.c.product_id == Product.id)
        .where(*product_conditions)
    )

    matching_ids_query = base_query.with_only_columns(Product.id)
    matching_product_ids = [
        row[0] for row in (await session.execute(matching_ids_query)).all()
    ]

    if not matching_product_ids:
        return ProductListResponse(
            items=[], total=0, page=page, page_size=page_size, facets=_EMPTY_FACETS
        )

    order_query = base_query
    if sort == "popular":
        popularity_agg = (
            select(
                ProductVariant.product_id.label("product_id"),
                func.coalesce(func.sum(OrderItem.quantity), 0).label("units_sold"),
            )
            .select_from(ProductVariant)
            .outerjoin(OrderItem, OrderItem.variant_id == ProductVariant.id)
            .group_by(ProductVariant.product_id)
            .subquery()
        )
        order_query = order_query.outerjoin(
            popularity_agg, popularity_agg.c.product_id == Product.id
        ).order_by(func.coalesce(popularity_agg.c.units_sold, 0).desc(), Product.created_at.desc())
    elif sort == "price_asc":
        order_query = order_query.order_by(variant_agg.c.price_from.asc())
    elif sort == "price_desc":
        order_query = order_query.order_by(variant_agg.c.price_from.desc())
    else:
        order_query = order_query.order_by(Product.created_at.desc())

    paginated_query = order_query.offset((page - 1) * page_size).limit(page_size)
    rows = (await session.execute(paginated_query)).all()

    images_by_product = await _load_primary_images(session, [row[0].id for row in rows])

    items = [
        ProductListItem(
            id=product.id,
            name=product.name,
            slug=product.slug,
            price_from=price_from,
            price_to=price_to,
            is_available=is_available,
            image_url=images_by_product.get(product.id),
        )
        for product, price_from, price_to, is_available in rows
    ]

    facets = await _compute_facets(
        session,
        matching_product_ids,
        price_min=price_min,
        price_max=price_max,
        options=options,
    )

    return ProductListResponse(
        items=items,
        total=len(matching_product_ids),
        page=page,
        page_size=page_size,
        facets=facets,
    )


async def _load_primary_images(
    session: AsyncSession, product_ids: list[uuid.UUID]
) -> dict[uuid.UUID, str]:
    if not product_ids:
        return {}

    rows = (
        await session.execute(
            select(ProductImage.product_id, ProductImage.s3_key)
            .where(ProductImage.product_id.in_(product_ids))
            .order_by(ProductImage.product_id, ProductImage.sort_order)
        )
    ).all()

    primary_by_product: dict[uuid.UUID, str] = {}
    for product_id, s3_key in rows:
        if product_id not in primary_by_product:
            primary_by_product[product_id] = generate_presigned_url(s3_key)

    return primary_by_product


async def _compute_facets(
    session: AsyncSession,
    product_ids: list[uuid.UUID],
    *,
    price_min: Decimal | None,
    price_max: Decimal | None,
    options: dict[str, list[str]] | None,
) -> FacetsResponse:
    if not product_ids:
        return _EMPTY_FACETS

    conditions = ["pv.product_id = ANY(:product_ids)", "pv.is_active = true"]
    params: dict[str, Any] = {"product_ids": product_ids}

    if price_min is not None:
        conditions.append("pv.price >= :price_min")
        params["price_min"] = price_min
    if price_max is not None:
        conditions.append("pv.price <= :price_max")
        params["price_max"] = price_max
    for index, (key, values) in enumerate((options or {}).items()):
        conditions.append(f"pv.options ->> :option_key_{index} = ANY(:option_values_{index})")
        params[f"option_key_{index}"] = key
        params[f"option_values_{index}"] = values

    where_clause = " AND ".join(conditions)

    price_row = (
        await session.execute(
            text(
                f"SELECT min(price) AS price_min, max(price) AS price_max "
                f"FROM product_variants pv WHERE {where_clause}"
            ),
            params,
        )
    ).one()

    options_result = await session.execute(
        text(
            f"""
            SELECT kv.key AS option_key,
                   array_agg(DISTINCT kv.value ORDER BY kv.value) AS option_values
            FROM product_variants pv
            CROSS JOIN LATERAL jsonb_each_text(pv.options) AS kv(key, value)
            WHERE {where_clause}
            GROUP BY kv.key
            """
        ),
        params,
    )
    options_facets = {row.option_key: row.option_values for row in options_result}

    return FacetsResponse(
        price_min=price_row.price_min, price_max=price_row.price_max, options=options_facets
    )


async def get_product_detail(session: AsyncSession, *, slug: str) -> ProductDetail | None:
    product = await session.scalar(
        select(Product)
        .options(
            selectinload(Product.variants),
            selectinload(Product.images),
            selectinload(Product.category),
        )
        .where(Product.slug == slug, Product.is_active.is_(True), Product.deleted_at.is_(None))
    )
    if product is None:
        return None

    images = sorted(product.images, key=lambda image: image.sort_order)

    return ProductDetail(
        id=product.id,
        name=product.name,
        slug=product.slug,
        description=product.description,
        attributes=product.attributes,
        category=CategorySummary(
            id=product.category.id, name=product.category.name, slug=product.category.slug
        ),
        variants=[
            ProductVariantPublic(
                id=variant.id,
                sku=variant.sku,
                options=variant.options,
                price=variant.price,
                compare_at_price=variant.compare_at_price,
                stock_qty=variant.stock_qty,
                is_active=variant.is_active,
                is_available=variant.is_active and variant.stock_qty > 0,
            )
            for variant in product.variants
        ],
        images=[
            ProductImagePublic(
                url=generate_presigned_url(image.s3_key), alt=image.alt, sort_order=image.sort_order
            )
            for image in images
        ],
    )
