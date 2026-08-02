"use client";

import { Check, Loader2, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useAddCartItemMutation } from "@/entities/cart/queries";
import { getProductBySlug, type ProductListItem } from "@/entities/product/api";
import { formatPrice } from "@/shared/lib/formatPrice";

type QuickAddState = "idle" | "loading" | "done";

interface ProductCardProps {
  product: ProductListItem;
  layout?: "grid" | "list";
}

export function ProductCard({ product, layout = "grid" }: ProductCardProps) {
  const router = useRouter();
  const addItem = useAddCartItemMutation();
  const [quickAddState, setQuickAddState] = useState<QuickAddState>("idle");
  // Guards against a double-add from two clicks landing before the "loading"
  // state has re-rendered (the `disabled` attribute alone can't catch that,
  // since it only takes effect after a commit) -- checked and set
  // synchronously, unlike state.
  const quickAddInFlightRef = useRef(false);

  const priceLabel =
    product.price_from === product.price_to
      ? formatPrice(product.price_from)
      : `от ${formatPrice(product.price_from)}`;

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

  return (
    <div
      className={`group relative rounded-xl border border-ink/10 bg-bg shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        isList ? "flex items-center gap-4 p-3" : "flex flex-col overflow-hidden"
      }`}
    >
      <div
        className={`relative shrink-0 overflow-hidden bg-surface ${
          isList ? "h-24 w-24 rounded-lg sm:h-28 sm:w-28" : "aspect-square w-full"
        }`}
      >
        {product.image_url ? (
          // unoptimized: Next's optimizer fetches server-side, which can't reach the
          // presigned URL's public host from inside the frontend container; the
          // backend already serves pre-resized webp, so we don't need it anyway.
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            unoptimized
            sizes={isList ? "112px" : "(min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw"}
            className={`object-cover transition duration-200 ${isList ? "" : "group-hover:scale-105"}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-muted">
            Нет фото
          </div>
        )}

        {!product.is_available && (
          <span className="absolute left-2 top-2 rounded-lg bg-ink/85 px-2 py-1 text-xs font-medium text-white">
            Нет в наличии
          </span>
        )}

        {product.is_available && !isList && (
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={quickAddState === "loading"}
            aria-label="Быстро добавить в корзину"
            className={`absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-bg/90 text-ink shadow-sm backdrop-blur transition duration-150 hover:bg-brand hover:text-white focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:opacity-0 sm:group-hover:opacity-100 ${
              quickAddState !== "idle" ? "sm:opacity-100" : ""
            }`}
          >
            {quickAddState === "loading" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {quickAddState === "done" && <Check className="h-4 w-4" aria-hidden="true" />}
            {quickAddState === "idle" && <Plus className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}
      </div>

      <div
        className={`flex flex-1 flex-col gap-1 ${isList ? "min-w-0 justify-center" : "p-3"}`}
      >
        <h3 className={`text-sm text-ink ${isList ? "line-clamp-1" : "line-clamp-2"}`}>
          <Link
            href={`/product/${product.slug}`}
            className="static after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {product.name}
          </Link>
        </h3>
        <p
          className={`relative font-mono text-base font-medium text-ink ${isList ? "" : "mt-auto"}`}
        >
          {priceLabel}
        </p>
      </div>
    </div>
  );
}
