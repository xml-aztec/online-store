import uuid

from pydantic import BaseModel


class UpdateMeRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None


class AddressCreate(BaseModel):
    city: str
    street: str
    building: str
    apartment: str | None = None
    postal_code: str | None = None
    comment: str | None = None
    is_default: bool = False


class AddressUpdate(BaseModel):
    city: str | None = None
    street: str | None = None
    building: str | None = None
    apartment: str | None = None
    postal_code: str | None = None
    comment: str | None = None
    is_default: bool | None = None


class AddressPublic(BaseModel):
    id: uuid.UUID
    city: str
    street: str
    building: str
    apartment: str | None
    postal_code: str | None
    comment: str | None
    is_default: bool
