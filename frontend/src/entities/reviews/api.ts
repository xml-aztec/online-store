import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type Review = components["schemas"]["ReviewPublic"];
export type ReviewListResponse = components["schemas"]["ReviewListResponse"];
export type MyReviewResponse = components["schemas"]["MyReviewResponse"];

export async function listReviews(slug: string, page = 1): Promise<ReviewListResponse> {
  return apiFetch<ReviewListResponse>(
    `/products/${encodeURIComponent(slug)}/reviews?page=${page}`
  );
}

export async function getMyReview(slug: string): Promise<MyReviewResponse> {
  return apiFetch<MyReviewResponse>(`/products/${encodeURIComponent(slug)}/reviews/me`);
}

export async function createReview(
  slug: string,
  payload: { rating: number; comment?: string | null }
): Promise<Review> {
  return apiFetch<Review>(`/products/${encodeURIComponent(slug)}/reviews`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateMyReview(
  slug: string,
  payload: { rating?: number; comment?: string | null }
): Promise<Review> {
  return apiFetch<Review>(`/products/${encodeURIComponent(slug)}/reviews/me`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteMyReview(slug: string): Promise<void> {
  await apiFetch<void>(`/products/${encodeURIComponent(slug)}/reviews/me`, { method: "DELETE" });
}
