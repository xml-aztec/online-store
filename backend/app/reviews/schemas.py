from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = None


class ReviewUpdate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    comment: str | None = None


class ReviewPublic(BaseModel):
    id: uuid.UUID
    author_label: str
    rating: int
    comment: str | None
    status: str
    is_verified_purchase: bool
    created_at: datetime


class ReviewListResponse(BaseModel):
    items: list[ReviewPublic]
    total: int
    page: int
    page_size: int


class MyReviewResponse(BaseModel):
    eligible: bool
    review: ReviewPublic | None
