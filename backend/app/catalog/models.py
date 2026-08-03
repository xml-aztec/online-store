import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TimestampedBase


class Category(TimestampedBase):
    __tablename__ = "categories"

    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(nullable=False)
    slug: Mapped[str] = mapped_column(unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))

    parent: Mapped["Category | None"] = relationship(
        remote_side="Category.id", back_populates="children"
    )
    children: Mapped[list["Category"]] = relationship(back_populates="parent")
    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(TimestampedBase):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_search_vector", "search_vector", postgresql_using="gin"),
        Index(
            "ix_products_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
    )

    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"), nullable=False)
    name: Mapped[str] = mapped_column(nullable=False)
    slug: Mapped[str] = mapped_column(unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(nullable=True)
    attributes: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    is_active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    external_id: Mapped[str | None] = mapped_column(unique=True, nullable=True)
    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed(
            "to_tsvector('russian', coalesce(name, '') || ' ' || coalesce(description, ''))",
            persisted=True,
        ),
        nullable=True,
    )

    category: Mapped[Category] = relationship(back_populates="products")
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="ProductImage.sort_order"
    )


class ProductVariant(TimestampedBase):
    __tablename__ = "product_variants"
    __table_args__ = (
        UniqueConstraint("product_id", "options", name="uq_product_variants_product_options"),
        CheckConstraint("price >= 0", name="ck_product_variants_price_non_negative"),
        CheckConstraint("stock_qty >= 0", name="ck_product_variants_stock_qty_non_negative"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    sku: Mapped[str] = mapped_column(unique=True, nullable=False)
    options: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    compare_at_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    stock_qty: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))
    external_id: Mapped[str | None] = mapped_column(unique=True, nullable=True)

    product: Mapped[Product] = relationship(back_populates="variants")


class ProductImage(TimestampedBase):
    __tablename__ = "product_images"

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    s3_key: Mapped[str] = mapped_column(nullable=False)
    thumbnail_s3_key: Mapped[str | None] = mapped_column(nullable=True)
    alt: Mapped[str | None] = mapped_column(nullable=True)
    sort_order: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))

    product: Mapped[Product] = relationship(back_populates="images")


class Banner(TimestampedBase):
    __tablename__ = "banners"

    title: Mapped[str | None] = mapped_column(nullable=True)
    subtitle: Mapped[str | None] = mapped_column(nullable=True)
    link_url: Mapped[str | None] = mapped_column(nullable=True)
    button_text: Mapped[str | None] = mapped_column(nullable=True)
    s3_key: Mapped[str] = mapped_column(nullable=False)
    thumbnail_s3_key: Mapped[str | None] = mapped_column(nullable=True)
    sort_order: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))
