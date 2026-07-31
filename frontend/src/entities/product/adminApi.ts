import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type AdminProductListItem = components["schemas"]["AdminProductListItem"];
export type AdminProductListResponse = components["schemas"]["AdminProductListResponse"];
export type AdminProductDetail = components["schemas"]["AdminProductDetail"];
export type AdminProductVariant = components["schemas"]["AdminProductVariantPublic"];

export async function listAdminProducts(
  page = 1,
  pageSize = 50
): Promise<AdminProductListResponse> {
  return apiFetch<AdminProductListResponse>(`/admin/products?page=${page}&page_size=${pageSize}`);
}

export async function getAdminProduct(productId: string): Promise<AdminProductDetail> {
  return apiFetch<AdminProductDetail>(`/admin/products/${productId}`);
}

export async function updateAdminVariant(
  productId: string,
  variantId: string,
  updates: { price?: string; stock_qty?: number }
): Promise<AdminProductVariant> {
  return apiFetch<AdminProductVariant>(`/admin/products/${productId}/variants/${variantId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}
