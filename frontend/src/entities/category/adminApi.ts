import { apiFetch, apiFetchRaw } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type AdminCategory = components["schemas"]["AdminCategoryPublic"];
export type AdminCategoryListResponse = components["schemas"]["AdminCategoryListResponse"];
export type AdminCategoryCreate = components["schemas"]["AdminCategoryCreate"];
export type AdminCategoryUpdate = components["schemas"]["AdminCategoryUpdate"];

export async function listAdminCategories(
  page = 1,
  pageSize = 100
): Promise<AdminCategoryListResponse> {
  return apiFetch<AdminCategoryListResponse>(
    `/admin/categories?page=${page}&page_size=${pageSize}`
  );
}

export async function createAdminCategory(
  payload: AdminCategoryCreate
): Promise<AdminCategory> {
  return apiFetch<AdminCategory>("/admin/categories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminCategory(
  categoryId: string,
  payload: AdminCategoryUpdate
): Promise<AdminCategory> {
  return apiFetch<AdminCategory>(`/admin/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminCategory(categoryId: string): Promise<void> {
  await apiFetch<void>(`/admin/categories/${categoryId}`, { method: "DELETE" });
}

export async function replaceAdminCategoryImage(
  categoryId: string,
  file: File
): Promise<AdminCategory> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiFetchRaw(`/admin/categories/${categoryId}/image`, {
    method: "POST",
    body: formData,
  });
  return (await response.json()) as AdminCategory;
}
