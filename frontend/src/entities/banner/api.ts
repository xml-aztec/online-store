import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type Banner = components["schemas"]["BannerPublic"];

export async function getBanners(): Promise<Banner[]> {
  return apiFetch<Banner[]>("/banners", { next: { revalidate: 60 } });
}
