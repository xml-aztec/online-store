import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, cast

from sqlalchemy import ColumnElement, case, func, or_, select, text, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Banner, Category, Product, ProductImage, ProductVariant
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
from app.config import settings
from app.core.queue import get_arq_pool
from app.core.redis import get_redis
from app.core.storage import ensure_bucket_exists, generate_presigned_url, get_s3_client
from app.exceptions import DomainError
from app.orders.models import OrderItem
from app.reviews.models import Review

# Variants matching the current filters must additionally clear this to count
# toward a product's discount_percent aggregate -- otherwise a single
# clearance variant would badge the whole product regardless of which variant
# a filtered view is actually showing.
_DISCOUNT_PERCENT_EXPR = func.max(
    case(
        (
            ProductVariant.compare_at_price > ProductVariant.price,
            func.round(
                100 * (1 - ProductVariant.price / ProductVariant.compare_at_price)
            ),
        ),
        else_=None,
    )
)
# The raw pre-discount price, alongside the rounded percent above -- product
# cards show both ("349 сом" + strikethrough "435"), and back-computing the
# original price from the rounded percent would be visibly off by a few сом.
_COMPARE_AT_PRICE_EXPR = func.max(
    case(
        (ProductVariant.compare_at_price > ProductVariant.price, ProductVariant.compare_at_price),
        else_=None,
    )
)

_MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024

_CATEGORY_TREE_CACHE_KEY = "catalog:categories:tree"
_CATEGORY_TREE_CACHE_TTL = 300


def _validate_image_upload(content_type: str | None, contents: bytes) -> str:
    if content_type is None or not content_type.startswith("image/"):
        raise DomainError("Файл должен быть изображением", code="INVALID_IMAGE", status_code=400)
    if len(contents) > _MAX_IMAGE_SIZE_BYTES:
        raise DomainError(
            "Файл слишком большой (максимум 10 МБ)", code="IMAGE_TOO_LARGE", status_code=400
        )
    return content_type


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

    count_rows = (
        await session.execute(
            select(Product.category_id, func.count())
            .where(Product.is_active.is_(True), Product.deleted_at.is_(None))
            .group_by(Product.category_id)
        )
    ).all()
    own_counts: dict[uuid.UUID, int] = {row[0]: row[1] for row in count_rows}

    nodes: dict[uuid.UUID, CategoryNode] = {
        category.id: CategoryNode(
            id=category.id,
            name=category.name,
            slug=category.slug,
            sort_order=category.sort_order,
            product_count=own_counts.get(category.id, 0),
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

    # product_count must include descendants (matches flatten_category_ids'
    # subtree semantics, which is what list_products' `category` filter uses),
    # so roll each leaf's own count up through its ancestor chain after the
    # tree shape is known.
    parent_by_id = {category.id: category.parent_id for category in categories}
    for category in categories:
        own = own_counts.get(category.id, 0)
        if not own:
            continue
        ancestor_id = parent_by_id.get(category.id)
        while ancestor_id is not None and ancestor_id in nodes:
            nodes[ancestor_id].product_count += own
            ancestor_id = parent_by_id.get(ancestor_id)

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
    in_stock: bool | None = None,
    on_sale: bool | None = None,
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
    if in_stock:
        variant_conditions.append(ProductVariant.stock_qty > 0)
    if on_sale:
        variant_conditions.append(ProductVariant.compare_at_price > ProductVariant.price)
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
            func.sum(ProductVariant.stock_qty).label("stock_qty"),
            _DISCOUNT_PERCENT_EXPR.label("discount_percent"),
            _COMPARE_AT_PRICE_EXPR.label("compare_at_price"),
        )
        .where(*variant_conditions)
        .group_by(ProductVariant.product_id)
        .subquery()
    )

    # Rating is a product-level fact, not tied to which variant a filter
    # happens to match, so it's aggregated independently of variant_conditions.
    rating_agg = (
        select(
            Review.product_id.label("product_id"),
            func.avg(Review.rating).label("rating_avg"),
            func.count(Review.id).label("rating_count"),
        )
        .where(Review.status == "approved")
        .group_by(Review.product_id)
        .subquery()
    )

    base_query = (
        select(
            Product,
            variant_agg.c.price_from,
            variant_agg.c.price_to,
            variant_agg.c.is_available,
            variant_agg.c.stock_qty,
            variant_agg.c.discount_percent,
            variant_agg.c.compare_at_price,
            rating_agg.c.rating_avg,
            rating_agg.c.rating_count,
        )
        .join(variant_agg, variant_agg.c.product_id == Product.id)
        .outerjoin(rating_agg, rating_agg.c.product_id == Product.id)
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

    images_by_product = await _load_images_by_product(session, [row[0].id for row in rows])
    items = [_row_to_list_item(row, images_by_product) for row in rows]

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


def _row_to_list_item(row: Any, images_by_product: dict[uuid.UUID, list[str]]) -> ProductListItem:
    (
        product,
        price_from,
        price_to,
        is_available,
        stock_qty,
        discount_percent,
        compare_at_price,
        rating_avg,
        rating_count,
    ) = row
    images = images_by_product.get(product.id, [])
    return ProductListItem(
        id=product.id,
        name=product.name,
        slug=product.slug,
        price_from=price_from,
        price_to=price_to,
        is_available=is_available,
        image_url=images[0] if images else None,
        image_urls=images,
        discount_percent=int(discount_percent) if discount_percent is not None else None,
        compare_at_price=compare_at_price,
        stock_qty=int(stock_qty or 0),
        rating_avg=round(float(rating_avg), 1) if rating_avg is not None else None,
        rating_count=int(rating_count or 0),
    )


# Product cards hover-cycle through a few images (Wildberries-style) -- capped
# so a product with dozens of photos doesn't balloon every catalog page's
# presigned-URL count.
_CARD_IMAGE_LIMIT = 6


async def _load_images_by_product(
    session: AsyncSession, product_ids: list[uuid.UUID], *, limit: int = _CARD_IMAGE_LIMIT
) -> dict[uuid.UUID, list[str]]:
    if not product_ids:
        return {}

    rows = (
        await session.execute(
            select(ProductImage.product_id, ProductImage.s3_key, ProductImage.thumbnail_s3_key)
            .where(ProductImage.product_id.in_(product_ids))
            .order_by(ProductImage.product_id, ProductImage.sort_order)
        )
    ).all()

    images_by_product: dict[uuid.UUID, list[str]] = {}
    for product_id, s3_key, thumbnail_s3_key in rows:
        urls = images_by_product.setdefault(product_id, [])
        if len(urls) >= limit:
            continue
        urls.append(generate_presigned_url(thumbnail_s3_key or s3_key))

    return images_by_product


async def hydrate_product_list_items(
    session: AsyncSession, product_ids: list[uuid.UUID]
) -> dict[uuid.UUID, ProductListItem]:
    """Build ProductListItem rows for an explicit set of product ids, with no
    filter context (aggregated over *all* active variants/approved reviews) --
    for callers like favorites that show a fixed set of products rather than
    a filtered/paginated search. Returns a dict (not a list) since callers own
    the ordering (e.g. favorited-at order); missing/inactive product ids are
    simply absent from the result.

    Deliberately not shared with list_products' inline aggregation: that
    query's variant_agg is filter-conditional (price/color/etc.) by design,
    which doesn't apply here.
    """
    if not product_ids:
        return {}

    variant_agg = (
        select(
            ProductVariant.product_id.label("product_id"),
            func.min(ProductVariant.price).label("price_from"),
            func.max(ProductVariant.price).label("price_to"),
            func.bool_or(ProductVariant.stock_qty > 0).label("is_available"),
            func.sum(ProductVariant.stock_qty).label("stock_qty"),
            _DISCOUNT_PERCENT_EXPR.label("discount_percent"),
            _COMPARE_AT_PRICE_EXPR.label("compare_at_price"),
        )
        .where(ProductVariant.is_active.is_(True), ProductVariant.product_id.in_(product_ids))
        .group_by(ProductVariant.product_id)
        .subquery()
    )
    rating_agg = (
        select(
            Review.product_id.label("product_id"),
            func.avg(Review.rating).label("rating_avg"),
            func.count(Review.id).label("rating_count"),
        )
        .where(Review.status == "approved", Review.product_id.in_(product_ids))
        .group_by(Review.product_id)
        .subquery()
    )

    rows = (
        await session.execute(
            select(
                Product,
                variant_agg.c.price_from,
                variant_agg.c.price_to,
                variant_agg.c.is_available,
                variant_agg.c.stock_qty,
                variant_agg.c.discount_percent,
                variant_agg.c.compare_at_price,
                rating_agg.c.rating_avg,
                rating_agg.c.rating_count,
            )
            .join(variant_agg, variant_agg.c.product_id == Product.id)
            .outerjoin(rating_agg, rating_agg.c.product_id == Product.id)
            .where(
                Product.id.in_(product_ids),
                Product.is_active.is_(True),
                Product.deleted_at.is_(None),
            )
        )
    ).all()

    images_by_product = await _load_images_by_product(session, [row[0].id for row in rows])
    items = [_row_to_list_item(row, images_by_product) for row in rows]
    return {item.id: item for item in items}


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

    rating_row = (
        await session.execute(
            select(func.avg(Review.rating), func.count(Review.id)).where(
                Review.product_id == product.id, Review.status == "approved"
            )
        )
    ).one()
    rating_avg, rating_count = rating_row

    return ProductDetail(
        id=product.id,
        name=product.name,
        slug=product.slug,
        description=product.description,
        attributes=product.attributes,
        category=CategorySummary(
            id=product.category.id, name=product.category.name, slug=product.category.slug
        ),
        rating_avg=round(float(rating_avg), 1) if rating_avg is not None else None,
        rating_count=int(rating_count or 0),
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
                url=generate_presigned_url(image.s3_key),
                thumbnail_url=generate_presigned_url(image.thumbnail_s3_key or image.s3_key),
                alt=image.alt,
                sort_order=image.sort_order,
            )
            for image in images
        ],
    )


# --- Admin: categories ---

# ТЗ 4 (categories): "Максимальная вложенность — 3 уровня (валидировать в сервисе)".
MAX_CATEGORY_DEPTH = 3


async def _category_parent_map(session: AsyncSession) -> dict[uuid.UUID, uuid.UUID | None]:
    rows = (await session.execute(select(Category.id, Category.parent_id))).all()
    return {row.id: row.parent_id for row in rows}


def _ancestor_depth(
    parent_map: dict[uuid.UUID, uuid.UUID | None], category_id: uuid.UUID | None
) -> int:
    """Depth of category_id counted from 1 at a root category; 0 if category_id is None."""
    depth = 0
    current = category_id
    while current is not None:
        depth += 1
        current = parent_map.get(current)
    return depth


def _subtree_height(
    parent_map: dict[uuid.UUID, uuid.UUID | None], category_id: uuid.UUID
) -> int:
    """How many additional levels hang below category_id (0 for a leaf)."""
    children_map: dict[uuid.UUID, list[uuid.UUID]] = {}
    for child_id, parent_id in parent_map.items():
        if parent_id is not None:
            children_map.setdefault(parent_id, []).append(child_id)

    def _height(node_id: uuid.UUID) -> int:
        children = children_map.get(node_id, [])
        if not children:
            return 0
        return 1 + max(_height(child) for child in children)

    return _height(category_id)


def _ensure_depth_allowed(
    parent_map: dict[uuid.UUID, uuid.UUID | None],
    *,
    parent_id: uuid.UUID | None,
    subtree_height: int = 0,
) -> None:
    if parent_id is None:
        return
    resulting_depth = _ancestor_depth(parent_map, parent_id) + 1 + subtree_height
    if resulting_depth > MAX_CATEGORY_DEPTH:
        raise DomainError(
            f"Максимальная вложенность категорий — {MAX_CATEGORY_DEPTH} уровня",
            code="CATEGORY_TOO_DEEP",
            status_code=409,
        )


async def list_categories_admin(
    session: AsyncSession, *, page: int, page_size: int
) -> tuple[list[Category], int]:
    total = await session.scalar(select(func.count()).select_from(Category)) or 0
    rows = (
        await session.scalars(
            select(Category)
            .order_by(Category.sort_order)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return list(rows), total


async def get_admin_category_product_counts(session: AsyncSession) -> dict[uuid.UUID, int]:
    """Recursive per-category product count for the admin list -- same rollup
    algorithm as `_build_category_tree`, but deliberately without its
    `is_active` filters on categories/products: admins manage the whole
    catalog, including hidden categories and disabled products, so the count
    they see must reflect that, not just what's live on the storefront.
    Soft-deleted products (`deleted_at`) are still excluded -- those aren't
    part of the catalog at all anymore.
    """
    category_rows = (await session.execute(select(Category.id, Category.parent_id))).all()
    parent_by_id: dict[uuid.UUID, uuid.UUID | None] = {row[0]: row[1] for row in category_rows}

    count_rows = (
        await session.execute(
            select(Product.category_id, func.count())
            .where(Product.deleted_at.is_(None))
            .group_by(Product.category_id)
        )
    ).all()
    own_counts: dict[uuid.UUID, int] = {row[0]: row[1] for row in count_rows}

    counts: dict[uuid.UUID, int] = {category_id: 0 for category_id in parent_by_id}
    for category_id, own in own_counts.items():
        if category_id not in counts or not own:
            continue
        node_id: uuid.UUID | None = category_id
        while node_id is not None and node_id in counts:
            counts[node_id] += own
            node_id = parent_by_id.get(node_id)

    return counts


async def get_category_admin(session: AsyncSession, *, category_id: uuid.UUID) -> Category:
    category = await session.get(Category, category_id)
    if category is None:
        raise DomainError("Категория не найдена", code="CATEGORY_NOT_FOUND", status_code=404)
    return category


async def create_category(
    session: AsyncSession,
    *,
    name: str,
    slug: str,
    parent_id: uuid.UUID | None,
    sort_order: int,
) -> Category:
    if parent_id is not None and await session.get(Category, parent_id) is None:
        raise DomainError(
            "Родительская категория не найдена", code="CATEGORY_NOT_FOUND", status_code=404
        )
    if parent_id is not None:
        _ensure_depth_allowed(await _category_parent_map(session), parent_id=parent_id)

    category = Category(name=name, slug=slug, parent_id=parent_id, sort_order=sort_order)
    session.add(category)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise DomainError(
            "Категория с таким slug уже существует", code="SLUG_ALREADY_EXISTS", status_code=409
        ) from exc
    await invalidate_category_cache()
    return category


async def update_category(
    session: AsyncSession, *, category_id: uuid.UUID, updates: dict[str, Any]
) -> Category:
    category = await get_category_admin(session, category_id=category_id)

    if updates.get("is_active") is False and category.is_active:
        active_products = await session.scalar(
            select(func.count())
            .select_from(Product)
            .where(
                Product.category_id == category_id,
                Product.is_active.is_(True),
                Product.deleted_at.is_(None),
            )
        )
        if active_products:
            raise DomainError(
                "Нельзя деактивировать категорию с активными товарами",
                code="CATEGORY_HAS_ACTIVE_PRODUCTS",
                status_code=409,
            )

    new_parent_id = updates.get("parent_id")
    if new_parent_id is not None and await session.get(Category, new_parent_id) is None:
        raise DomainError(
            "Родительская категория не найдена", code="CATEGORY_NOT_FOUND", status_code=404
        )
    if "parent_id" in updates and new_parent_id is not None:
        parent_map = await _category_parent_map(session)
        _ensure_depth_allowed(
            parent_map,
            parent_id=new_parent_id,
            subtree_height=_subtree_height(parent_map, category_id),
        )

    for key, value in updates.items():
        setattr(category, key, value)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise DomainError(
            "Категория с таким slug уже существует", code="SLUG_ALREADY_EXISTS", status_code=409
        ) from exc
    await invalidate_category_cache()
    return category


async def delete_category(session: AsyncSession, *, category_id: uuid.UUID) -> None:
    category = await get_category_admin(session, category_id=category_id)

    has_children = await session.scalar(
        select(func.count()).select_from(Category).where(Category.parent_id == category_id)
    )
    if has_children:
        raise DomainError(
            "Нельзя удалить категорию с подкатегориями",
            code="CATEGORY_HAS_CHILDREN",
            status_code=409,
        )

    has_products = await session.scalar(
        select(func.count()).select_from(Product).where(Product.category_id == category_id)
    )
    if has_products:
        raise DomainError(
            "Нельзя удалить категорию с товарами", code="CATEGORY_HAS_PRODUCTS", status_code=409
        )

    await session.delete(category)
    await session.commit()
    await invalidate_category_cache()


# --- Admin: products ---


async def _get_admin_product_or_404(session: AsyncSession, product_id: uuid.UUID) -> Product:
    product = await session.get(Product, product_id)
    if product is None or product.deleted_at is not None:
        raise DomainError("Товар не найден", code="PRODUCT_NOT_FOUND", status_code=404)
    return product


@dataclass
class AdminProductRow:
    product: Product
    price_from: Decimal | None
    price_to: Decimal | None
    total_stock_qty: int
    variant_count: int
    # Set only when variant_count == 1 -- the admin products list only offers
    # inline price/stock editing for single-variant products (the common case
    # from imports); multi-variant products link out to the full edit form.
    single_variant_id: uuid.UUID | None


async def list_products_admin(
    session: AsyncSession,
    *,
    search: str | None,
    category_id: uuid.UUID | None,
    is_active: bool | None,
    page: int,
    page_size: int,
) -> tuple[list[AdminProductRow], int]:
    conditions: list[ColumnElement[bool]] = [Product.deleted_at.is_(None)]
    if search:
        conditions.append(Product.name.ilike(f"%{search}%"))
    if category_id is not None:
        conditions.append(Product.category_id == category_id)
    if is_active is not None:
        conditions.append(Product.is_active.is_(is_active))

    total = (
        await session.scalar(select(func.count()).select_from(Product).where(*conditions))
    ) or 0
    products = (
        await session.scalars(
            select(Product)
            .where(*conditions)
            .order_by(Product.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    if not products:
        return [], total

    product_ids = [product.id for product in products]
    variant_agg_rows = (
        await session.execute(
            select(
                ProductVariant.product_id,
                func.min(ProductVariant.price),
                func.max(ProductVariant.price),
                func.sum(ProductVariant.stock_qty),
                func.count(ProductVariant.id),
            )
            .where(ProductVariant.product_id.in_(product_ids))
            .group_by(ProductVariant.product_id)
        )
    ).all()
    agg_by_product = {row[0]: row[1:] for row in variant_agg_rows}

    single_variant_ids = [
        product_id for product_id, agg in agg_by_product.items() if agg[3] == 1
    ]
    single_variant_by_product: dict[uuid.UUID, uuid.UUID] = {}
    if single_variant_ids:
        rows = (
            await session.execute(
                select(ProductVariant.product_id, ProductVariant.id).where(
                    ProductVariant.product_id.in_(single_variant_ids)
                )
            )
        ).all()
        single_variant_by_product = {row[0]: row[1] for row in rows}

    result = []
    for product in products:
        agg = agg_by_product.get(product.id)
        result.append(
            AdminProductRow(
                product=product,
                price_from=agg[0] if agg else None,
                price_to=agg[1] if agg else None,
                total_stock_qty=int(agg[2] or 0) if agg else 0,
                variant_count=int(agg[3]) if agg else 0,
                single_variant_id=single_variant_by_product.get(product.id),
            )
        )
    return result, total


async def get_product_admin(session: AsyncSession, *, product_id: uuid.UUID) -> Product:
    product = await session.scalar(
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.images))
        .where(Product.id == product_id, Product.deleted_at.is_(None))
    )
    if product is None:
        raise DomainError("Товар не найден", code="PRODUCT_NOT_FOUND", status_code=404)
    return product


async def create_product(
    session: AsyncSession,
    *,
    category_id: uuid.UUID,
    name: str,
    slug: str,
    description: str | None,
    attributes: dict[str, Any],
) -> Product:
    if await session.get(Category, category_id) is None:
        raise DomainError("Категория не найдена", code="CATEGORY_NOT_FOUND", status_code=404)

    product = Product(
        category_id=category_id,
        name=name,
        slug=slug,
        description=description,
        attributes=attributes,
    )
    session.add(product)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise DomainError(
            "Товар с таким slug уже существует", code="SLUG_ALREADY_EXISTS", status_code=409
        ) from exc
    await invalidate_category_cache()
    return product


async def update_product(
    session: AsyncSession, *, product_id: uuid.UUID, updates: dict[str, Any]
) -> Product:
    product = await _get_admin_product_or_404(session, product_id)

    new_category_id = updates.get("category_id")
    if new_category_id is not None and await session.get(Category, new_category_id) is None:
        raise DomainError("Категория не найдена", code="CATEGORY_NOT_FOUND", status_code=404)

    for key, value in updates.items():
        setattr(product, key, value)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise DomainError(
            "Товар с таким slug уже существует", code="SLUG_ALREADY_EXISTS", status_code=409
        ) from exc
    # category_id/is_active changes both shift category product_count, and the
    # cheapest correct move is to invalidate unconditionally rather than
    # inspect `updates` for exactly which keys matter.
    await invalidate_category_cache()
    return product


async def soft_delete_product(session: AsyncSession, *, product_id: uuid.UUID) -> None:
    product = await _get_admin_product_or_404(session, product_id)
    product.deleted_at = datetime.now(UTC)
    product.is_active = False
    await session.commit()
    await invalidate_category_cache()


async def duplicate_product(session: AsyncSession, *, product_id: uuid.UUID) -> Product:
    original = await session.scalar(
        select(Product)
        .options(selectinload(Product.variants))
        .where(Product.id == product_id, Product.deleted_at.is_(None))
    )
    if original is None:
        raise DomainError("Товар не найден", code="PRODUCT_NOT_FOUND", status_code=404)

    suffix = uuid.uuid4().hex[:8]
    duplicate = Product(
        category_id=original.category_id,
        name=f"{original.name} (копия)",
        slug=f"{original.slug}-copy-{suffix}",
        description=original.description,
        attributes=dict(original.attributes),
        is_active=False,
    )
    session.add(duplicate)
    await session.flush()

    for variant in original.variants:
        session.add(
            ProductVariant(
                product_id=duplicate.id,
                sku=f"{variant.sku}-copy-{suffix}",
                options=dict(variant.options),
                price=variant.price,
                compare_at_price=variant.compare_at_price,
                stock_qty=0,
                is_active=variant.is_active,
            )
        )

    await session.commit()
    await invalidate_category_cache()
    return duplicate


async def bulk_set_products_active(
    session: AsyncSession, *, product_ids: list[uuid.UUID], is_active: bool
) -> int:
    result = cast(
        "CursorResult[Any]",
        await session.execute(
            update(Product)
            .where(Product.id.in_(product_ids), Product.deleted_at.is_(None))
            .values(is_active=is_active)
        ),
    )
    await session.commit()
    await invalidate_category_cache()
    return result.rowcount


# --- Admin: variants ---


async def create_variant(
    session: AsyncSession,
    *,
    product_id: uuid.UUID,
    sku: str,
    options: dict[str, Any],
    price: Decimal,
    compare_at_price: Decimal | None,
    stock_qty: int,
) -> ProductVariant:
    await _get_admin_product_or_404(session, product_id)

    variant = ProductVariant(
        product_id=product_id,
        sku=sku,
        options=options,
        price=price,
        compare_at_price=compare_at_price,
        stock_qty=stock_qty,
    )
    session.add(variant)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise DomainError(
            "Вариант с таким SKU или набором опций уже существует",
            code="VARIANT_ALREADY_EXISTS",
            status_code=409,
        ) from exc
    return variant


async def _get_admin_variant_or_404(
    session: AsyncSession, *, product_id: uuid.UUID, variant_id: uuid.UUID
) -> ProductVariant:
    variant = await session.scalar(
        select(ProductVariant).where(
            ProductVariant.id == variant_id, ProductVariant.product_id == product_id
        )
    )
    if variant is None:
        raise DomainError("Вариант не найден", code="VARIANT_NOT_FOUND", status_code=404)
    return variant


async def update_variant(
    session: AsyncSession,
    *,
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    updates: dict[str, Any],
) -> ProductVariant:
    variant = await _get_admin_variant_or_404(session, product_id=product_id, variant_id=variant_id)

    for key, value in updates.items():
        setattr(variant, key, value)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise DomainError(
            "Вариант с таким SKU или набором опций уже существует",
            code="VARIANT_ALREADY_EXISTS",
            status_code=409,
        ) from exc
    return variant


async def delete_variant(
    session: AsyncSession, *, product_id: uuid.UUID, variant_id: uuid.UUID
) -> None:
    variant = await _get_admin_variant_or_404(session, product_id=product_id, variant_id=variant_id)

    variant_count = await session.scalar(
        select(func.count())
        .select_from(ProductVariant)
        .where(ProductVariant.product_id == product_id)
    )
    if (variant_count or 0) <= 1:
        raise DomainError(
            "У товара должен остаться хотя бы один вариант",
            code="LAST_VARIANT",
            status_code=409,
        )

    await session.delete(variant)
    await session.commit()


# --- Admin: images ---


async def upload_product_image(
    session: AsyncSession,
    *,
    product_id: uuid.UUID,
    content_type: str | None,
    contents: bytes,
) -> ProductImage:
    await _get_admin_product_or_404(session, product_id)
    content_type = _validate_image_upload(content_type, contents)

    upload_id = uuid.uuid4().hex
    original_key = f"products/{product_id}/{upload_id}/original"

    ensure_bucket_exists()
    client = get_s3_client()
    client.put_object(
        Bucket=settings.s3_bucket, Key=original_key, Body=contents, ContentType=content_type
    )

    next_sort_order = await session.scalar(
        select(func.coalesce(func.max(ProductImage.sort_order) + 1, 0)).where(
            ProductImage.product_id == product_id
        )
    )

    image = ProductImage(
        product_id=product_id, s3_key=original_key, sort_order=next_sort_order or 0
    )
    session.add(image)
    await session.commit()

    pool = await get_arq_pool()
    await pool.enqueue_job(
        "process_product_image", image_id=str(image.id), original_s3_key=original_key
    )

    return image


async def _get_admin_image_or_404(
    session: AsyncSession, *, product_id: uuid.UUID, image_id: uuid.UUID
) -> ProductImage:
    image = await session.scalar(
        select(ProductImage).where(
            ProductImage.id == image_id, ProductImage.product_id == product_id
        )
    )
    if image is None:
        raise DomainError("Изображение не найдено", code="IMAGE_NOT_FOUND", status_code=404)
    return image


async def delete_product_image(
    session: AsyncSession, *, product_id: uuid.UUID, image_id: uuid.UUID
) -> None:
    image = await _get_admin_image_or_404(session, product_id=product_id, image_id=image_id)

    # original/thumbnail/large all live under the same "<upload_id>/" prefix
    # (see upload_product_image / workers.tasks._generate_previews) -- delete
    # everything under it in one go rather than tracking each key separately.
    prefix = image.s3_key.rsplit("/", 1)[0] + "/"
    client = get_s3_client()
    listing = client.list_objects_v2(Bucket=settings.s3_bucket, Prefix=prefix)
    keys = [obj["Key"] for obj in listing.get("Contents", [])]
    if keys:
        client.delete_objects(
            Bucket=settings.s3_bucket, Delete={"Objects": [{"Key": key} for key in keys]}
        )

    await session.delete(image)
    await session.commit()


async def reorder_product_images(
    session: AsyncSession, *, product_id: uuid.UUID, image_ids: list[uuid.UUID]
) -> list[ProductImage]:
    await _get_admin_product_or_404(session, product_id)

    images = (
        await session.scalars(
            select(ProductImage).where(ProductImage.product_id == product_id)
        )
    ).all()
    images_by_id = {image.id: image for image in images}

    if set(image_ids) != set(images_by_id.keys()):
        raise DomainError(
            "Список изображений должен содержать ровно все изображения товара",
            code="IMAGE_REORDER_MISMATCH",
            status_code=422,
        )

    for index, image_id in enumerate(image_ids):
        images_by_id[image_id].sort_order = index

    await session.commit()
    return sorted(images_by_id.values(), key=lambda image: image.sort_order)


# --- Banners ---

# Arbitrary constant key for pg_advisory_xact_lock: serializes the
# read-MAX-then-insert in create_banner below so two admins creating banners
# at the same moment can't both read the same MAX(sort_order) and collide.
_BANNER_CREATE_LOCK_KEY = 87_234_501


async def list_banners(session: AsyncSession) -> list[Banner]:
    # ТЗ 4 / 7.1: scheduled publish/unpublish -- NULL on either side means no
    # bound on that side (always started / never ends).
    now = datetime.now(UTC)
    rows = (
        await session.scalars(
            select(Banner)
            .where(
                Banner.is_active.is_(True),
                or_(Banner.starts_at.is_(None), Banner.starts_at <= now),
                or_(Banner.ends_at.is_(None), Banner.ends_at >= now),
            )
            .order_by(Banner.sort_order)
        )
    ).all()
    return list(rows)


async def list_banners_admin(session: AsyncSession) -> list[Banner]:
    rows = (await session.scalars(select(Banner).order_by(Banner.sort_order))).all()
    return list(rows)


async def _get_admin_banner_or_404(session: AsyncSession, banner_id: uuid.UUID) -> Banner:
    banner = await session.get(Banner, banner_id)
    if banner is None:
        raise DomainError("Баннер не найден", code="BANNER_NOT_FOUND", status_code=404)
    return banner


async def create_banner(
    session: AsyncSession,
    *,
    content_type: str | None,
    contents: bytes,
    title: str | None,
    subtitle: str | None,
    link_url: str | None,
    button_text: str | None,
) -> Banner:
    content_type = _validate_image_upload(content_type, contents)

    upload_id = uuid.uuid4().hex
    original_key = f"banners/{upload_id}/original"

    ensure_bucket_exists()
    client = get_s3_client()
    client.put_object(
        Bucket=settings.s3_bucket, Key=original_key, Body=contents, ContentType=content_type
    )

    # Held until this transaction commits/rolls back -- see constant comment above.
    await session.execute(select(func.pg_advisory_xact_lock(_BANNER_CREATE_LOCK_KEY)))
    next_sort_order = await session.scalar(
        select(func.coalesce(func.max(Banner.sort_order) + 1, 0))
    )

    banner = Banner(
        title=title,
        subtitle=subtitle,
        link_url=link_url,
        button_text=button_text,
        s3_key=original_key,
        sort_order=next_sort_order or 0,
    )
    session.add(banner)
    await session.commit()

    pool = await get_arq_pool()
    await pool.enqueue_job(
        "process_banner_image", banner_id=str(banner.id), original_s3_key=original_key
    )

    return banner


async def replace_banner_image(
    session: AsyncSession, *, banner_id: uuid.UUID, content_type: str | None, contents: bytes
) -> Banner:
    banner = await _get_admin_banner_or_404(session, banner_id)
    content_type = _validate_image_upload(content_type, contents)

    # The old original/preview objects live under the previous upload_id's
    # prefix -- keep them around until the new upload is committed, then clean
    # up, so a crash mid-upload never leaves the banner pointing at nothing.
    old_prefix = banner.s3_key.rsplit("/", 1)[0] + "/"

    upload_id = uuid.uuid4().hex
    original_key = f"banners/{upload_id}/original"
    ensure_bucket_exists()
    client = get_s3_client()
    client.put_object(
        Bucket=settings.s3_bucket, Key=original_key, Body=contents, ContentType=content_type
    )

    banner.s3_key = original_key
    banner.thumbnail_s3_key = None
    await session.commit()

    listing = client.list_objects_v2(Bucket=settings.s3_bucket, Prefix=old_prefix)
    keys = [obj["Key"] for obj in listing.get("Contents", [])]
    if keys:
        client.delete_objects(
            Bucket=settings.s3_bucket, Delete={"Objects": [{"Key": key} for key in keys]}
        )

    pool = await get_arq_pool()
    await pool.enqueue_job(
        "process_banner_image", banner_id=str(banner.id), original_s3_key=original_key
    )

    return banner


async def update_banner(
    session: AsyncSession, *, banner_id: uuid.UUID, updates: dict[str, Any]
) -> Banner:
    banner = await _get_admin_banner_or_404(session, banner_id)
    for field, value in updates.items():
        setattr(banner, field, value)
    await session.commit()
    return banner


async def delete_banner(session: AsyncSession, *, banner_id: uuid.UUID) -> None:
    banner = await _get_admin_banner_or_404(session, banner_id)

    prefix = banner.s3_key.rsplit("/", 1)[0] + "/"
    client = get_s3_client()
    listing = client.list_objects_v2(Bucket=settings.s3_bucket, Prefix=prefix)
    keys = [obj["Key"] for obj in listing.get("Contents", [])]
    if keys:
        client.delete_objects(
            Bucket=settings.s3_bucket, Delete={"Objects": [{"Key": key} for key in keys]}
        )

    await session.delete(banner)
    await session.commit()


async def reorder_banners(session: AsyncSession, *, banner_ids: list[uuid.UUID]) -> list[Banner]:
    banners = (await session.scalars(select(Banner))).all()
    banners_by_id = {banner.id: banner for banner in banners}

    if set(banner_ids) != set(banners_by_id.keys()):
        raise DomainError(
            "Список баннеров должен содержать ровно все баннеры",
            code="BANNER_REORDER_MISMATCH",
            status_code=422,
        )

    for index, banner_id in enumerate(banner_ids):
        banners_by_id[banner_id].sort_order = index

    await session.commit()
    return sorted(banners_by_id.values(), key=lambda banner: banner.sort_order)
