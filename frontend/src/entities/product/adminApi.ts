import { apiFetch, apiFetchRaw } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type AdminProductListItem = components["schemas"]["AdminProductListItem"];
export type AdminProductListResponse = components["schemas"]["AdminProductListResponse"];
export type AdminProductDetail = components["schemas"]["AdminProductDetail"];
export type AdminProductVariant = components["schemas"]["AdminProductVariantPublic"];
export type AdminProductImage = components["schemas"]["AdminProductImagePublic"];
export type AdminProductCreate = components["schemas"]["AdminProductCreate"];
export type AdminProductUpdate = components["schemas"]["AdminProductUpdate"];
export type AdminProductVariantCreate = components["schemas"]["AdminProductVariantCreate"];
export type AdminProductVariantUpdate = components["schemas"]["AdminProductVariantUpdate"];

export interface ListAdminProductsParams {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listAdminProducts(
  params: ListAdminProductsParams = {}
): Promise<AdminProductListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.categoryId) query.set("category_id", params.categoryId);
  if (params.isActive !== undefined) query.set("is_active", String(params.isActive));
  query.set("page", String(params.page ?? 1));
  query.set("page_size", String(params.pageSize ?? 50));
  return apiFetch<AdminProductListResponse>(`/admin/products?${query.toString()}`);
}

export async function getAdminProduct(productId: string): Promise<AdminProductDetail> {
  return apiFetch<AdminProductDetail>(`/admin/products/${productId}`);
}

export async function createAdminProduct(
  payload: AdminProductCreate
): Promise<AdminProductDetail> {
  return apiFetch<AdminProductDetail>("/admin/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminProduct(
  productId: string,
  payload: AdminProductUpdate
): Promise<AdminProductDetail> {
  return apiFetch<AdminProductDetail>(`/admin/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminProduct(productId: string): Promise<void> {
  await apiFetch<void>(`/admin/products/${productId}`, { method: "DELETE" });
}

export async function duplicateAdminProduct(productId: string): Promise<AdminProductDetail> {
  return apiFetch<AdminProductDetail>(`/admin/products/${productId}/duplicate`, {
    method: "POST",
  });
}

export async function bulkSetAdminProductsActive(
  productIds: string[],
  isActive: boolean
): Promise<{ updated: number }> {
  return apiFetch<{ updated: number }>("/admin/products/bulk-status", {
    method: "POST",
    body: JSON.stringify({ product_ids: productIds, is_active: isActive }),
  });
}

export async function createAdminVariant(
  productId: string,
  payload: AdminProductVariantCreate
): Promise<AdminProductVariant> {
  return apiFetch<AdminProductVariant>(`/admin/products/${productId}/variants`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminVariant(
  productId: string,
  variantId: string,
  updates: AdminProductVariantUpdate
): Promise<AdminProductVariant> {
  return apiFetch<AdminProductVariant>(`/admin/products/${productId}/variants/${variantId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function deleteAdminVariant(productId: string, variantId: string): Promise<void> {
  await apiFetch<void>(`/admin/products/${productId}/variants/${variantId}`, {
    method: "DELETE",
  });
}

export async function uploadAdminProductImage(
  productId: string,
  file: File
): Promise<AdminProductImage> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiFetchRaw(`/admin/products/${productId}/images`, {
    method: "POST",
    body: formData,
  });
  return (await response.json()) as AdminProductImage;
}

export async function deleteAdminProductImage(
  productId: string,
  imageId: string
): Promise<void> {
  await apiFetch<void>(`/admin/products/${productId}/images/${imageId}`, { method: "DELETE" });
}

export async function reorderAdminProductImages(
  productId: string,
  imageIds: string[]
): Promise<AdminProductImage[]> {
  return apiFetch<AdminProductImage[]>(`/admin/products/${productId}/images/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ image_ids: imageIds }),
  });
}
