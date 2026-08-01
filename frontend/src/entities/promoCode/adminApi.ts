import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type AdminPromoCode = components["schemas"]["AdminPromoCodePublic"];
export type AdminPromoCodeListResponse = components["schemas"]["AdminPromoCodeListResponse"];
export type AdminPromoCodeCreate = components["schemas"]["AdminPromoCodeCreate"];
export type AdminPromoCodeUpdate = components["schemas"]["AdminPromoCodeUpdate"];

export async function listAdminPromoCodes(
  page = 1,
  pageSize = 50
): Promise<AdminPromoCodeListResponse> {
  return apiFetch<AdminPromoCodeListResponse>(
    `/admin/promo-codes?page=${page}&page_size=${pageSize}`
  );
}

export async function createAdminPromoCode(
  payload: AdminPromoCodeCreate
): Promise<AdminPromoCode> {
  return apiFetch<AdminPromoCode>("/admin/promo-codes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminPromoCode(
  promoId: string,
  payload: AdminPromoCodeUpdate
): Promise<AdminPromoCode> {
  return apiFetch<AdminPromoCode>(`/admin/promo-codes/${promoId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminPromoCode(promoId: string): Promise<void> {
  await apiFetch<void>(`/admin/promo-codes/${promoId}`, { method: "DELETE" });
}
