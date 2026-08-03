"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/entities/auth/store";
import { isFavorited, useFavoriteIdsQuery, useToggleFavoriteMutation } from "@/entities/favorites/queries";

interface FavoriteButtonProps {
  productId: string;
  className?: string;
}

export function FavoriteButton({ productId, className = "" }: FavoriteButtonProps) {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const { data: favoriteIds } = useFavoriteIdsQuery();
  const toggle = useToggleFavoriteMutation();

  const active = isFavorited(favoriteIds, productId);

  function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (status !== "authenticated") {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    toggle.mutate({ productId, isFavorite: active });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      aria-label={active ? "Убрать из избранного" : "Добавить в избранное"}
      className={`flex h-9 w-9 items-center justify-center rounded-lg bg-bg/90 shadow-sm backdrop-blur transition hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${className}`}
    >
      <Heart
        className={`h-[18px] w-[18px] ${active ? "fill-accent-sale text-accent-sale" : "text-ink"}`}
        aria-hidden="true"
      />
    </button>
  );
}
