"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@/entities/auth/store";
import { ApiError } from "@/shared/api/client";

import { createReview, deleteMyReview, getMyReview, updateMyReview } from "./api";
import type { Review } from "./api";

export function myReviewQueryKey(slug: string) {
  return ["reviews", "me", slug] as const;
}

export function useMyReviewQuery(slug: string) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: myReviewQueryKey(slug),
    queryFn: () => getMyReview(slug),
    enabled: status === "authenticated",
  });
}

export function useSubmitReviewMutation(slug: string) {
  const queryClient = useQueryClient();

  return useMutation<Review, ApiError, { rating: number; comment?: string | null }>({
    mutationFn: (payload) => createReview(slug, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: myReviewQueryKey(slug) });
    },
  });
}

export function useUpdateReviewMutation(slug: string) {
  const queryClient = useQueryClient();

  return useMutation<Review, ApiError, { rating?: number; comment?: string | null }>({
    mutationFn: (payload) => updateMyReview(slug, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: myReviewQueryKey(slug) });
    },
  });
}

export function useDeleteReviewMutation(slug: string) {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, void>({
    mutationFn: () => deleteMyReview(slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: myReviewQueryKey(slug) });
    },
  });
}
