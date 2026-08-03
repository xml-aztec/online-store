import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type AdminReview = components["schemas"]["AdminReviewPublic"];
export type AdminReviewListResponse = components["schemas"]["AdminReviewListResponse"];

export async function listAdminReviews(status?: string): Promise<AdminReviewListResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<AdminReviewListResponse>(`/admin/reviews${query}`);
}

export async function moderateReview(
  reviewId: string,
  status: "approved" | "rejected"
): Promise<AdminReview> {
  return apiFetch<AdminReview>(`/admin/reviews/${reviewId}/moderate`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}
