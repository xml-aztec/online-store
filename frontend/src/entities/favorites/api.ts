import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type FavoriteListResponse = components["schemas"]["FavoriteListResponse"];

export async function listFavorites(page = 1, pageSize = 24): Promise<FavoriteListResponse> {
  return apiFetch<FavoriteListResponse>(`/me/favorites?page=${page}&page_size=${pageSize}`);
}

export async function listFavoriteIds(): Promise<string[]> {
  return apiFetch<string[]>("/me/favorites/ids");
}

export async function addFavorite(productId: string): Promise<void> {
  await apiFetch<void>(`/me/favorites/${productId}`, { method: "POST" });
}

export async function removeFavorite(productId: string): Promise<void> {
  await apiFetch<void>(`/me/favorites/${productId}`, { method: "DELETE" });
}
