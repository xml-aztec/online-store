from __future__ import annotations

from pydantic import BaseModel

from app.catalog.schemas import ProductListItem


class FavoriteListResponse(BaseModel):
    items: list[ProductListItem]
    total: int
    page: int
    page_size: int
