"use client";

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import { getProductBySlug } from "@/entities/product/api";
import { FavoriteButton } from "@/shared/ui/FavoriteButton";
import { RatingRow } from "@/shared/ui/RatingRow";
import { ProductGallery } from "@/widgets/ProductGallery";
import { ProductPurchasePanel } from "@/widgets/ProductPurchasePanel";

interface QuickViewModalProps {
  slug: string;
  open: boolean;
  onClose: () => void;
}

export function QuickViewModal({ slug, open, onClose }: QuickViewModalProps) {
  const { data: product, isLoading } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => getProductBySlug(slug),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/50" onClick={onClose} />

      {/* Near-fullscreen on sm+ (fixed height, image pane and info rail
          split the width) so the photo can bleed edge to edge like a real
          product page instead of sitting in a small boxed-in thumbnail.
          Mobile keeps the original stacked, content-sized sheet -- there's
          no spare width there to split into two panes. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={product ? product.name : "Быстрый просмотр товара"}
        className="relative flex max-h-[92vh] w-full max-w-[1220px] flex-col overflow-hidden rounded-2xl bg-bg shadow-xl sm:h-[82vh] sm:max-h-[820px] sm:flex-row"
      >
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2 sm:right-4 sm:top-4">
          {product && <FavoriteButton productId={product.id} />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg/90 shadow-sm backdrop-blur transition hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X className="h-5 w-5 text-ink" aria-hidden="true" />
          </button>
        </div>

        {isLoading || !product ? (
          <div className="flex h-full w-full flex-col overflow-y-auto sm:flex-row" aria-busy="true">
            <div className="aspect-square w-full shrink-0 animate-pulse bg-surface sm:aspect-auto sm:h-full sm:w-auto sm:flex-1" />
            <div className="flex-1 space-y-3 p-5 pt-16 sm:w-[440px] sm:shrink-0 sm:p-8 sm:pt-16">
              <div className="h-6 w-3/4 animate-pulse rounded bg-surface" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-surface" />
              <div className="h-8 w-1/2 animate-pulse rounded bg-surface" />
              <div className="h-10 w-full animate-pulse rounded bg-surface" />
            </div>
          </div>
        ) : (
          <>
            <div className="relative aspect-square w-full shrink-0 bg-surface sm:aspect-auto sm:h-full sm:w-auto sm:flex-1">
              <ProductGallery images={product.images} alt={product.name} fill />
            </div>

            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-5 pt-16 sm:w-[440px] sm:shrink-0 sm:p-8 sm:pt-16">
              <h2 className="font-display text-lg font-bold text-ink sm:text-xl">
                {product.name}
              </h2>
              <div className="mt-1.5">
                <RatingRow
                  ratingAvg={product.rating_avg ?? null}
                  ratingCount={product.rating_count}
                  size="md"
                />
              </div>

              <div className="mt-5">
                <ProductPurchasePanel
                  variants={product.variants}
                  productId={product.id}
                  productName={product.name}
                  productSlug={product.slug}
                  imageUrl={product.images[0]?.url ?? null}
                  showFavorite={false}
                  variant="compact"
                />
              </div>

              <Link
                href={`/product/${product.slug}`}
                onClick={onClose}
                className="mt-4 inline-block text-sm font-semibold text-brand hover:text-brand/80"
              >
                Все детали товара →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
