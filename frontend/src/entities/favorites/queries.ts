"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@/entities/auth/store";
import { ApiError } from "@/shared/api/client";

import { addFavorite, listFavoriteIds, listFavorites, removeFavorite } from "./api";

export const FAVORITE_IDS_QUERY_KEY = ["favorites", "ids"] as const;
export const FAVORITES_LIST_QUERY_KEY = ["favorites", "list"] as const;

export function useFavoriteIdsQuery() {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: FAVORITE_IDS_QUERY_KEY,
    queryFn: listFavoriteIds,
    enabled: status === "authenticated",
  });
}

export function useFavoritesListQuery(page = 1) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: [...FAVORITES_LIST_QUERY_KEY, page],
    queryFn: () => listFavorites(page),
    enabled: status === "authenticated",
  });
}

interface ToggleFavoriteVariables {
  productId: string;
  isFavorite: boolean;
}

interface MutationContext {
  previous: string[] | undefined;
}

export function useToggleFavoriteMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, ToggleFavoriteVariables, MutationContext>({
    mutationFn: ({ productId, isFavorite }) =>
      isFavorite ? removeFavorite(productId) : addFavorite(productId),
    onMutate: async ({ productId, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: FAVORITE_IDS_QUERY_KEY });
      const previous = queryClient.getQueryData<string[]>(FAVORITE_IDS_QUERY_KEY);

      queryClient.setQueryData<string[]>(FAVORITE_IDS_QUERY_KEY, (ids = []) =>
        isFavorite ? ids.filter((id) => id !== productId) : [productId, ...ids]
      );

      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(FAVORITE_IDS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: FAVORITE_IDS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: FAVORITES_LIST_QUERY_KEY });
    },
  });
}

export function isFavorited(ids: string[] | undefined, productId: string): boolean {
  return ids?.includes(productId) ?? false;
}
