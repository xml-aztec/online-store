import uuid

from pydantic import BaseModel


class UpdateMeRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None


class AddressCreate(BaseModel):
    label: str | None = None
    city: str
    street: str
    building: str
    apartment: str | None = None
    postal_code: str | None = None
    comment: str | None = None
    is_default: bool = False


class AddressUpdate(BaseModel):
    label: str | None = None
    city: str | None = None
    street: str | None = None
    building: str | None = None
    apartment: str | None = None
    postal_code: str | None = None
    comment: str | None = None
    is_default: bool | None = None


class AddressPublic(BaseModel):
    id: uuid.UUID
    label: str | None
    city: str
    street: str
    building: str
    apartment: str | None
    postal_code: str | None
    comment: str | None
    is_default: bool
