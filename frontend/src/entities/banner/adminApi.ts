import { apiFetch, apiFetchRaw } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type AdminBanner = components["schemas"]["AdminBannerPublic"];
export type AdminBannerUpdate = components["schemas"]["AdminBannerUpdate"];

export interface AdminBannerCreateFields {
  title?: string;
  subtitle?: string;
  link_url?: string;
  button_text?: string;
}

export async function listAdminBanners(): Promise<AdminBanner[]> {
  return apiFetch<AdminBanner[]>("/admin/banners");
}

export async function createAdminBanner(
  file: File,
  fields: AdminBannerCreateFields
): Promise<AdminBanner> {
  const formData = new FormData();
  formData.append("file", file);
  for (const [key, value] of Object.entries(fields)) {
    if (value) formData.append(key, value);
  }
  const response = await apiFetchRaw("/admin/banners", { method: "POST", body: formData });
  return (await response.json()) as AdminBanner;
}

export async function updateAdminBanner(
  bannerId: string,
  payload: AdminBannerUpdate
): Promise<AdminBanner> {
  return apiFetch<AdminBanner>(`/admin/banners/${bannerId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function replaceAdminBannerImage(bannerId: string, file: File): Promise<AdminBanner> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiFetchRaw(`/admin/banners/${bannerId}/image`, {
    method: "POST",
    body: formData,
  });
  return (await response.json()) as AdminBanner;
}

export async function reorderAdminBanners(bannerIds: string[]): Promise<AdminBanner[]> {
  return apiFetch<AdminBanner[]>("/admin/banners/reorder", {
    method: "PATCH",
    body: JSON.stringify({ banner_ids: bannerIds }),
  });
}

export async function deleteAdminBanner(bannerId: string): Promise<void> {
  await apiFetch<void>(`/admin/banners/${bannerId}`, { method: "DELETE" });
}
