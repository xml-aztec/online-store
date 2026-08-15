"use client";

import { Heart } from "lucide-react";
import Link from "next/link";

import { useFavoritesListQuery } from "@/entities/favorites/queries";
import { ProductCard } from "@/widgets/ProductCard";

export function FavoritesView() {
  const { data, isLoading } = useFavoritesListQuery();

  if (isLoading) {
    return (
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
        aria-busy="true"
        aria-label="Загрузка избранного"
      >
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex animate-content-fade-in flex-col items-center gap-4 py-16 text-center">
        <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-accent-sale/10">
          <Heart className="h-10 w-10 text-accent-sale" aria-hidden="true" />
          <svg
            className="absolute right-[6px] top-[10px] h-4 w-4 text-accent-sale"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2l2.4 5.3 5.6.6-4.2 3.9 1.2 5.6L12 14.5 7 17.4l1.2-5.6L4 7.9l5.6-.6Z" />
          </svg>
        </span>
        <div>
          <p className="font-display text-lg font-bold text-ink">Пока пусто</p>
          <p className="mt-1 max-w-xs text-sm text-ink-muted">
            Добавляйте товары нажатием на сердечко в каталоге — они сохранятся здесь.
          </p>
        </div>
        <Link
          href="/catalog"
          className="mt-2 inline-block rounded-lg bg-brand px-6 py-3 text-sm font-medium text-white hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Перейти в каталог
        </Link>
      </div>
    );
  }

  return (
    <div className="grid animate-content-fade-in grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {data.items.map((product) => (
        <ProductCard key={product.id} product={product} showFavorite />
      ))}
    </div>
  );
}
