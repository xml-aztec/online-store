import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";
import type { UserPublic } from "@/entities/auth/api";

export type AddressPublic = components["schemas"]["AddressPublic"];
export type AddressCreate = components["schemas"]["AddressCreate"];
export type AddressUpdate = components["schemas"]["AddressUpdate"];

export async function updateProfile(updates: {
  full_name?: string;
  phone?: string;
}): Promise<UserPublic> {
  return apiFetch<UserPublic>("/me", { method: "PATCH", body: JSON.stringify(updates) });
}

export async function listAddresses(): Promise<AddressPublic[]> {
  return apiFetch<AddressPublic[]>("/me/addresses");
}

export async function createAddress(payload: AddressCreate): Promise<AddressPublic> {
  return apiFetch<AddressPublic>("/me/addresses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAddress(
  addressId: string,
  payload: AddressUpdate
): Promise<AddressPublic> {
  return apiFetch<AddressPublic>(`/me/addresses/${addressId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAddress(addressId: string): Promise<void> {
  await apiFetch<void>(`/me/addresses/${addressId}`, { method: "DELETE" });
}
