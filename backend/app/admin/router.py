import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.schemas import (
    AdminBannerPublic,
    AdminBannerReorderRequest,
    AdminBannerUpdate,
    AdminCategoryCreate,
    AdminCategoryListResponse,
    AdminCategoryPublic,
    AdminCategoryUpdate,
    AdminImageReorderRequest,
    AdminProductCreate,
    AdminProductDetail,
    AdminProductImagePublic,
    AdminProductListItem,
    AdminProductListResponse,
    AdminProductUpdate,
    AdminProductVariantCreate,
    AdminProductVariantPublic,
    AdminProductVariantUpdate,
    BulkStatusRequest,
    BulkStatusResponse,
)
from app.catalog import service as catalog_service
from app.catalog.models import Banner, Category, Product, ProductImage, ProductVariant
from app.core.storage import generate_presigned_url
from app.database import get_db
from app.dependencies import require_role

router = APIRouter(
    prefix="/admin", tags=["admin-catalog"], dependencies=[Depends(require_role("admin"))]
)


def _category_to_public(category: Category, *, product_count: int = 0) -> AdminCategoryPublic:
    return AdminCategoryPublic(
        id=category.id,
        name=category.name,
        slug=category.slug,
        parent_id=category.parent_id,
        sort_order=category.sort_order,
        is_active=category.is_active,
        product_count=product_count,
        image_url=generate_presigned_url(category.image_s3_key)
        if category.image_s3_key
        else None,
        thumbnail_url=generate_presigned_url(
            category.image_thumbnail_s3_key or category.image_s3_key
        )
        if category.image_s3_key
        else None,
    )


def _variant_to_public(variant: ProductVariant) -> AdminProductVariantPublic:
    return AdminProductVariantPublic(
        id=variant.id,
        sku=variant.sku,
        options=variant.options,
        price=variant.price,
        compare_at_price=variant.compare_at_price,
        stock_qty=variant.stock_qty,
        is_active=variant.is_active,
    )


def _image_to_public(image: ProductImage) -> AdminProductImagePublic:
    return AdminProductImagePublic(
        id=image.id,
        url=generate_presigned_url(image.s3_key),
        thumbnail_url=generate_presigned_url(image.thumbnail_s3_key or image.s3_key),
        alt=image.alt,
        sort_order=image.sort_order,
    )


def _banner_to_public(banner: Banner) -> AdminBannerPublic:
    return AdminBannerPublic(
        id=banner.id,
        title=banner.title,
        subtitle=banner.subtitle,
        link_url=banner.link_url,
        button_text=banner.button_text,
        image_url=generate_presigned_url(banner.s3_key),
        thumbnail_url=generate_presigned_url(banner.thumbnail_s3_key or banner.s3_key),
        sort_order=banner.sort_order,
        is_active=banner.is_active,
        starts_at=banner.starts_at,
        ends_at=banner.ends_at,
    )


def _product_to_detail(product: Product) -> AdminProductDetail:
    images = sorted(product.images, key=lambda image: image.sort_order)
    return AdminProductDetail(
        id=product.id,
        category_id=product.category_id,
        name=product.name,
        slug=product.slug,
        description=product.description,
        attributes=product.attributes,
        is_active=product.is_active,
        variants=[_variant_to_public(variant) for variant in product.variants],
        images=[_image_to_public(image) for image in images],
    )


# --- Categories ---


@router.post(
    "/categories", response_model=AdminCategoryPublic, status_code=status.HTTP_201_CREATED
)
async def create_category(
    payload: AdminCategoryCreate, db: Annotated[AsyncSession, Depends(get_db)]
) -> AdminCategoryPublic:
    category = await catalog_service.create_category(
        db,
        name=payload.name,
        slug=payload.slug,
        parent_id=payload.parent_id,
        sort_order=payload.sort_order,
    )
    return _category_to_public(category)


@router.get("/categories", response_model=AdminCategoryListResponse)
async def list_categories(
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 24,
) -> AdminCategoryListResponse:
    categories, total = await catalog_service.list_categories_admin(
        db, page=page, page_size=page_size
    )
    counts = await catalog_service.get_admin_category_product_counts(db)
    return AdminCategoryListResponse(
        items=[
            _category_to_public(category, product_count=counts.get(category.id, 0))
            for category in categories
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/categories/{category_id}", response_model=AdminCategoryPublic)
async def get_category(
    category_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]
) -> AdminCategoryPublic:
    category = await catalog_service.get_category_admin(db, category_id=category_id)
    return _category_to_public(category)


@router.patch("/categories/{category_id}", response_model=AdminCategoryPublic)
async def update_category(
    category_id: uuid.UUID,
    payload: AdminCategoryUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminCategoryPublic:
    category = await catalog_service.update_category(
        db, category_id=category_id, updates=payload.model_dump(exclude_unset=True)
    )
    return _category_to_public(category)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]
) -> None:
    await catalog_service.delete_category(db, category_id=category_id)


@router.post("/categories/{category_id}/image", response_model=AdminCategoryPublic)
async def replace_category_image(
    category_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File()],
) -> AdminCategoryPublic:
    contents = await file.read()
    category = await catalog_service.replace_category_image(
        db, category_id=category_id, content_type=file.content_type, contents=contents
    )
    return _category_to_public(category)


# --- Products ---


@router.post("/products/bulk-status", response_model=BulkStatusResponse)
async def bulk_set_products_active(
    payload: BulkStatusRequest, db: Annotated[AsyncSession, Depends(get_db)]
) -> BulkStatusResponse:
    updated = await catalog_service.bulk_set_products_active(
        db, product_ids=payload.product_ids, is_active=payload.is_active
    )
    return BulkStatusResponse(updated=updated)


@router.post("/products", response_model=AdminProductDetail, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: AdminProductCreate, db: Annotated[AsyncSession, Depends(get_db)]
) -> AdminProductDetail:
    created = await catalog_service.create_product(
        db,
        category_id=payload.category_id,
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        attributes=payload.attributes,
    )
    product = await catalog_service.get_product_admin(db, product_id=created.id)
    return _product_to_detail(product)


@router.get("/products", response_model=AdminProductListResponse)
async def list_products(
    db: Annotated[AsyncSession, Depends(get_db)],
    search: str | None = None,
    category_id: uuid.UUID | None = None,
    is_active: bool | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 24,
) -> AdminProductListResponse:
    rows, total = await catalog_service.list_products_admin(
        db,
        search=search,
        category_id=category_id,
        is_active=is_active,
        page=page,
        page_size=page_size,
    )
    return AdminProductListResponse(
        items=[
            AdminProductListItem(
                id=row.product.id,
                category_id=row.product.category_id,
                name=row.product.name,
                slug=row.product.slug,
                is_active=row.product.is_active,
                price_from=row.price_from,
                price_to=row.price_to,
                total_stock_qty=row.total_stock_qty,
                variant_count=row.variant_count,
                single_variant_id=row.single_variant_id,
            )
            for row in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/products/{product_id}", response_model=AdminProductDetail)
async def get_product(
    product_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]
) -> AdminProductDetail:
    product = await catalog_service.get_product_admin(db, product_id=product_id)
    return _product_to_detail(product)


@router.patch("/products/{product_id}", response_model=AdminProductDetail)
async def update_product(
    product_id: uuid.UUID,
    payload: AdminProductUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminProductDetail:
    await catalog_service.update_product(
        db, product_id=product_id, updates=payload.model_dump(exclude_unset=True)
    )
    product = await catalog_service.get_product_admin(db, product_id=product_id)
    return _product_to_detail(product)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]
) -> None:
    await catalog_service.soft_delete_product(db, product_id=product_id)


@router.post(
    "/products/{product_id}/duplicate",
    response_model=AdminProductDetail,
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_product(
    product_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]
) -> AdminProductDetail:
    duplicate = await catalog_service.duplicate_product(db, product_id=product_id)
    product = await catalog_service.get_product_admin(db, product_id=duplicate.id)
    return _product_to_detail(product)


# --- Variants ---


@router.post(
    "/products/{product_id}/variants",
    response_model=AdminProductVariantPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_variant(
    product_id: uuid.UUID,
    payload: AdminProductVariantCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminProductVariantPublic:
    variant = await catalog_service.create_variant(
        db,
        product_id=product_id,
        sku=payload.sku,
        options=payload.options,
        price=payload.price,
        compare_at_price=payload.compare_at_price,
        stock_qty=payload.stock_qty,
    )
    return _variant_to_public(variant)


@router.patch(
    "/products/{product_id}/variants/{variant_id}", response_model=AdminProductVariantPublic
)
async def update_variant(
    product_id: uuid.UUID,
    variant_id: uuid.UUID,
    payload: AdminProductVariantUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminProductVariantPublic:
    variant = await catalog_service.update_variant(
        db,
        product_id=product_id,
        variant_id=variant_id,
        updates=payload.model_dump(exclude_unset=True),
    )
    return _variant_to_public(variant)


@router.delete(
    "/products/{product_id}/variants/{variant_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_variant(
    product_id: uuid.UUID, variant_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]
) -> None:
    await catalog_service.delete_variant(db, product_id=product_id, variant_id=variant_id)


# --- Images ---


@router.post(
    "/products/{product_id}/images",
    response_model=AdminProductImagePublic,
    status_code=status.HTTP_201_CREATED,
)
async def upload_product_image(
    product_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File()],
) -> AdminProductImagePublic:
    contents = await file.read()
    image = await catalog_service.upload_product_image(
        db, product_id=product_id, content_type=file.content_type, contents=contents
    )
    return _image_to_public(image)


@router.patch("/products/{product_id}/images/reorder", response_model=list[AdminProductImagePublic])
async def reorder_product_images(
    product_id: uuid.UUID,
    payload: AdminImageReorderRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AdminProductImagePublic]:
    images = await catalog_service.reorder_product_images(
        db, product_id=product_id, image_ids=payload.image_ids
    )
    return [_image_to_public(image) for image in images]


@router.delete(
    "/products/{product_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_product_image(
    product_id: uuid.UUID, image_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]
) -> None:
    await catalog_service.delete_product_image(db, product_id=product_id, image_id=image_id)


# --- Banners ---


@router.get("/banners", response_model=list[AdminBannerPublic])
async def list_banners(db: Annotated[AsyncSession, Depends(get_db)]) -> list[AdminBannerPublic]:
    banners = await catalog_service.list_banners_admin(db)
    return [_banner_to_public(banner) for banner in banners]


@router.post("/banners", response_model=AdminBannerPublic, status_code=status.HTTP_201_CREATED)
async def create_banner(
    db: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form()] = None,
    subtitle: Annotated[str | None, Form()] = None,
    link_url: Annotated[str | None, Form()] = None,
    button_text: Annotated[str | None, Form()] = None,
) -> AdminBannerPublic:
    contents = await file.read()
    banner = await catalog_service.create_banner(
        db,
        content_type=file.content_type,
        contents=contents,
        title=title,
        subtitle=subtitle,
        link_url=link_url,
        button_text=button_text,
    )
    return _banner_to_public(banner)


@router.patch("/banners/reorder", response_model=list[AdminBannerPublic])
async def reorder_banners(
    payload: AdminBannerReorderRequest, db: Annotated[AsyncSession, Depends(get_db)]
) -> list[AdminBannerPublic]:
    banners = await catalog_service.reorder_banners(db, banner_ids=payload.banner_ids)
    return [_banner_to_public(banner) for banner in banners]


@router.patch("/banners/{banner_id}", response_model=AdminBannerPublic)
async def update_banner(
    banner_id: uuid.UUID,
    payload: AdminBannerUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminBannerPublic:
    banner = await catalog_service.update_banner(
        db, banner_id=banner_id, updates=payload.model_dump(exclude_unset=True)
    )
    return _banner_to_public(banner)


@router.post("/banners/{banner_id}/image", response_model=AdminBannerPublic)
async def replace_banner_image(
    banner_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File()],
) -> AdminBannerPublic:
    contents = await file.read()
    banner = await catalog_service.replace_banner_image(
        db, banner_id=banner_id, content_type=file.content_type, contents=contents
    )
    return _banner_to_public(banner)


@router.delete("/banners/{banner_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_banner(
    banner_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]
) -> None:
    await catalog_service.delete_banner(db, banner_id=banner_id)
