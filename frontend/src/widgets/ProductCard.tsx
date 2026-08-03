"use client";

import { Check, Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useAddCartItemMutation } from "@/entities/cart/queries";
import { getProductBySlug, type ProductListItem } from "@/entities/product/api";
import { Badge } from "@/shared/ui/Badge";
import { FavoriteButton } from "@/shared/ui/FavoriteButton";
import { HoverImageCycle } from "@/shared/ui/HoverImageCycle";
import { PriceBlock } from "@/shared/ui/PriceBlock";
import { RatingRow } from "@/shared/ui/RatingRow";
import { StockLabel } from "@/shared/ui/StockLabel";
import { QuickViewModal } from "@/widgets/QuickViewModal";

type QuickAddState = "idle" | "loading" | "done";

interface ProductCardProps {
  product: ProductListItem;
  layout?: "grid" | "list";
  /** Shows the favorite heart -- omitted wherever a product card is used in a
   * context where favoriting doesn't make sense (there currently is none,
   * but keeping this explicit rather than always-on avoids surprises if one
   * shows up). */
  showFavorite?: boolean;
  /** "Новinka"/"Хит" have no generic backend flag (unlike the sale badge,
   * which is data-driven from discount_percent) -- callers whose section
   * *is* that semantic by construction (e.g. a "Новинки" rail) pass it
   * explicitly instead. */
  badges?: ("new" | "hit")[];
}

export function ProductCard({ product, layout = "grid", showFavorite, badges }: ProductCardProps) {
  const router = useRouter();
  const addItem = useAddCartItemMutation();
  const [quickAddState, setQuickAddState] = useState<QuickAddState>("idle");
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  // Guards against a double-add from two clicks landing before the "loading"
  // state has re-rendered (the `disabled` attribute alone can't catch that,
  // since it only takes effect after a commit) -- checked and set
  // synchronously, unlike state.
  const quickAddInFlightRef = useRef(false);

  async function handleQuickAdd() {
    if (quickAddInFlightRef.current) return;
    quickAddInFlightRef.current = true;
    setQuickAddState("loading");

    let addedToCart = false;
    try {
      const detail = await getProductBySlug(product.slug);
      const available = detail?.variants.filter(
        (variant) => variant.is_available && variant.stock_qty > 0
      );

      // A real color/volume choice exists -- don't guess it for the customer,
      // send them to the product page to pick instead of silently adding one.
      if (!detail || !available || available.length === 0 || detail.variants.length > 1) {
        router.push(`/product/${product.slug}`);
        return;
      }

      const variant = available[0];
      await addItem.mutateAsync({
        variantId: variant.id,
        qty: 1,
        newItem: {
          product_id: detail.id,
          product_name: detail.name,
          product_slug: detail.slug,
          sku: variant.sku,
          options: variant.options,
          image_url: product.image_url,
          price: variant.price,
        },
      });
      addedToCart = true;
      setQuickAddState("done");
      setTimeout(() => {
        quickAddInFlightRef.current = false;
        setQuickAddState("idle");
      }, 1200);
    } catch {
      router.push(`/product/${product.slug}`);
    } finally {
      if (!addedToCart) quickAddInFlightRef.current = false;
    }
  }

  const isList = layout === "list";
  const images = product.image_urls.length > 0
    ? product.image_urls
    : product.image_url
      ? [product.image_url]
      : [];

  return (
    <div
      className={`group relative rounded-xl border border-ink/10 bg-bg shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        isList ? "flex items-center gap-4 p-3" : "flex flex-col overflow-hidden p-2.5"
      }`}
    >
      <div
        className={`relative shrink-0 overflow-hidden rounded-lg bg-surface ${
          isList ? "h-24 w-24 sm:h-28 sm:w-28" : "aspect-square w-full"
        }`}
      >
        {images.length > 0 ? (
          // unoptimized: Next's optimizer fetches server-side, which can't reach the
          // presigned URL's public host from inside the frontend container; the
          // backend already serves pre-resized webp, so we don't need it anyway.
          <HoverImageCycle
            images={images}
            alt={product.name}
            sizes={isList ? "112px" : "(min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw"}
            imageClassName={`object-cover ${isList ? "" : "transition duration-200 group-hover:scale-105"}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-muted">
            Нет фото
          </div>
        )}

        {!isList && (
          <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1.5">
            {product.discount_percent != null && (
              <Badge variant="sale">-{product.discount_percent}%</Badge>
            )}
            {badges?.includes("new") && <Badge variant="new">Новинка</Badge>}
            {badges?.includes("hit") && <Badge variant="hit">Хит</Badge>}
          </div>
        )}

        {!product.is_available && (
          <span className="absolute left-2 top-2 rounded-lg bg-ink/85 px-2 py-1 text-xs font-medium text-white">
            Нет в наличии
          </span>
        )}

        {showFavorite && !isList && (
          <FavoriteButton productId={product.id} className="absolute right-2 top-2 z-20" />
        )}

        {product.is_available && !isList && (
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={quickAddState === "loading"}
            aria-label="Быстро добавить в корзину"
            className={`absolute bottom-[42px] right-2 z-20 hidden h-9 w-9 items-center justify-center rounded-lg bg-brand text-white shadow-md transition duration-150 hover:bg-brand/90 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:flex sm:opacity-0 sm:group-hover:opacity-100 ${
              quickAddState !== "idle" ? "sm:opacity-100" : ""
            }`}
          >
            {quickAddState === "loading" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {quickAddState === "done" && <Check className="h-4 w-4" aria-hidden="true" />}
            {quickAddState === "idle" && <Plus className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}

        {!isList && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setQuickViewOpen(true);
            }}
            className="absolute inset-x-0 bottom-0 z-20 hidden translate-y-full items-center justify-center gap-1.5 bg-ink/80 py-2 text-xs font-semibold text-white opacity-0 backdrop-blur-sm transition-all duration-150 sm:flex sm:group-hover:translate-y-0 sm:group-hover:opacity-100"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            Быстрый просмотр
          </button>
        )}
      </div>

      <div
        className={`flex flex-1 flex-col gap-1.5 ${isList ? "min-w-0 justify-center" : "pt-2.5"}`}
      >
        {!isList && (
          <PriceBlock
            price={product.price_from}
            compareAtPrice={product.compare_at_price ?? null}
            size="sm"
          />
        )}
        {isList && (
          <p className="relative font-mono text-base font-medium text-ink">
            {product.price_from === product.price_to
              ? product.price_from
              : `от ${product.price_from}`}
          </p>
        )}

        <h3 className={`text-sm text-ink ${isList ? "line-clamp-1" : "line-clamp-2"}`}>
          <Link
            href={`/product/${product.slug}`}
            className="static after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {product.name}
          </Link>
        </h3>

        {!isList && (
          <>
            <RatingRow ratingAvg={product.rating_avg ?? null} ratingCount={product.rating_count} />
            <StockLabel stockQty={product.stock_qty} isAvailable={product.is_available} />
          </>
        )}

        {product.is_available && !isList && (
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={quickAddState === "loading"}
            className="relative mt-1 w-full rounded-lg bg-brand py-2 text-xs font-bold text-white transition hover:bg-brand/90 disabled:opacity-60 sm:hidden"
          >
            {quickAddState === "loading" ? "Добавляем…" : "В корзину"}
          </button>
        )}
      </div>

      {!isList && (
        <QuickViewModal
          slug={product.slug}
          open={quickViewOpen}
          onClose={() => setQuickViewOpen(false)}
        />
      )}
    </div>
  );
}
