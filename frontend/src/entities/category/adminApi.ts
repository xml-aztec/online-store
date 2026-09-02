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

// The admin categories page renders one drag-reorderable tree rather than a
// paged list (splitting a tree by page/page_size would separate parents
// from their children onto different pages -- see admin/categories/page.tsx).
// That means it needs *every* category, not just the first page, so this
// walks the backend's page/page_size pagination internally and returns the
// full set -- otherwise a catalog with more than one page's worth of
// categories (page_size caps at 100 server-side) would silently lose the
// rest.
export async function listAllAdminCategories(): Promise<AdminCategory[]> {
  const pageSize = 100;
  const first = await listAdminCategories(1, pageSize);
  const items = [...first.items];
  const totalPages = Math.ceil(first.total / pageSize);
  for (let page = 2; page <= totalPages; page++) {
    const next = await listAdminCategories(page, pageSize);
    items.push(...next.items);
  }
  return items;
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
