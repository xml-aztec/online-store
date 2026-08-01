import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type AdminUser = components["schemas"]["AdminUserPublic"];
export type AdminUserListResponse = components["schemas"]["AdminUserListResponse"];
export type AdminUserUpdate = components["schemas"]["AdminUserUpdate"];

export async function listAdminUsers(
  search?: string,
  page = 1,
  pageSize = 50
): Promise<AdminUserListResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (search) params.set("search", search);
  return apiFetch<AdminUserListResponse>(`/admin/users?${params.toString()}`);
}

export async function updateAdminUser(
  userId: string,
  payload: AdminUserUpdate
): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
