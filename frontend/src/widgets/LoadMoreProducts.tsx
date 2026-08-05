"use client";

import { useState } from "react";

import { listProducts, type ListProductsParams, type ProductListItem } from "@/entities/product/api";
import { ProductCard } from "@/widgets/ProductCard";

interface LoadMoreProductsProps {
  params: ListProductsParams;
  initialPage: number;
  totalPages: number;
  view: "grid" | "list";
}

// SSR keeps rendering page 1 through the normal server-fetched flow (so
// direct links/bookmarks/back-forward work); this only handles the
// "Показать ещё" button appending subsequent pages client-side. Clicking a
// specific page number in <Pagination> still does a normal navigation and
// drops whatever was appended here -- that's expected.
export function LoadMoreProducts({ params, initialPage, totalPages, view }: LoadMoreProductsProps) {
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);

  async function handleLoadMore() {
    setLoading(true);
    try {
      const nextPage = page + 1;
      const response = await listProducts({ ...params, page: nextPage });
      setItems((previous) => [...previous, ...response.items]);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {items.length > 0 && (
        <div
          className={
            view === "grid"
              ? "mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
              : "mt-3 flex flex-col gap-3"
          }
        >
          {items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              layout={view}
              showFavorite={view === "grid"}
            />
          ))}
        </div>
      )}

      {page < totalPages && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loading}
            className="rounded-lg bg-surface px-10 py-3 font-medium text-ink transition hover:bg-ink/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {loading ? "Загружаем…" : "Показать ещё"}
          </button>
        </div>
      )}
    </>
  );
}
