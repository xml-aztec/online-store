"use client";

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import { getProductBySlug } from "@/entities/product/api";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-ink/50"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={product ? product.name : "Быстрый просмотр товара"}
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-bg p-5 shadow-md sm:p-6"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-ink-muted hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {isLoading || !product ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2" aria-busy="true">
            <div className="aspect-square animate-pulse rounded-xl bg-surface" />
            <div className="space-y-3">
              <div className="h-6 w-3/4 animate-pulse rounded bg-surface" />
              <div className="h-8 w-1/3 animate-pulse rounded bg-surface" />
              <div className="h-10 w-full animate-pulse rounded bg-surface" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 pt-2 sm:grid-cols-2 sm:pt-0">
            <ProductGallery images={product.images} alt={product.name} />

            <div className="min-w-0">
              <h2 className="pr-8 font-display text-lg font-bold text-ink sm:text-xl">
                {product.name}
              </h2>
              <div className="mt-1.5">
                <RatingRow
                  ratingAvg={product.rating_avg ?? null}
                  ratingCount={product.rating_count}
                  size="md"
                />
              </div>

              <div className="mt-4">
                <ProductPurchasePanel
                  variants={product.variants}
                  productId={product.id}
                  productName={product.name}
                  productSlug={product.slug}
                  imageUrl={product.images[0]?.url ?? null}
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
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
