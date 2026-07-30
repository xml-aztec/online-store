import { ApiError, apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type ProductListItem = components["schemas"]["ProductListItem"];
export type ProductDetail = components["schemas"]["ProductDetail"];
export type ProductListResponse = components["schemas"]["ProductListResponse"];
export type ProductVariant = components["schemas"]["ProductVariantPublic"];
export type ProductImage = components["schemas"]["ProductImagePublic"];
export type FacetsResponse = components["schemas"]["FacetsResponse"];
export type ProductSort = "price_asc" | "price_desc" | "newest" | "popular";

export interface ListProductsParams {
  category?: string;
  q?: string;
  price_min?: string;
  price_max?: string;
  options?: Record<string, string[]>;
  sort?: ProductSort;
  page?: number;
  page_size?: number;
}

function buildProductsQuery(params: ListProductsParams): string {
  const search = new URLSearchParams();
  if (params.category) search.set("category", params.category);
  if (params.q) search.set("q", params.q);
  if (params.price_min) search.set("price_min", params.price_min);
  if (params.price_max) search.set("price_max", params.price_max);
  if (params.sort) search.set("sort", params.sort);
  if (params.page) search.set("page", String(params.page));
  if (params.page_size) search.set("page_size", String(params.page_size));
  if (params.options) {
    for (const [key, values] of Object.entries(params.options)) {
      for (const value of values) {
        search.append(`options[${key}]`, value);
      }
    }
  }
  return search.toString();
}

export async function listProducts(
  params: ListProductsParams = {}
): Promise<ProductListResponse> {
  const query = buildProductsQuery(params);
  return apiFetch<ProductListResponse>(`/products${query ? `?${query}` : ""}`);
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  try {
    return await apiFetch<ProductDetail>(`/products/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
