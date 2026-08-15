"use client";

import { CircleAlert, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import type { CartItem } from "@/entities/cart/api";
import { useUpdateCartItemMutation } from "@/entities/cart/queries";
import { useToggleFavoriteMutation } from "@/entities/favorites/queries";
import { isColorFacet, swatchStyle } from "@/shared/lib/colorSwatches";
import { formatPrice } from "@/shared/lib/formatPrice";

export function CartItemRow({ item }: { item: CartItem }) {
  const updateItem = useUpdateCartItemMutation();
  const toggleFavorite = useToggleFavoriteMutation();
  const status = useAuthStore((state) => state.status);
  const [imageLoaded, setImageLoaded] = useState(false);

  const colorEntry = Object.entries(item.options).find(([key]) => isColorFacet(key));
  const optionsLabel = Object.values(item.options).map(String).join(", ");
  const exceedsStock = item.is_available && item.qty > item.available_qty;

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-ink/10 py-4 last:border-0 sm:flex-nowrap">
      <Link
        href={`/product/${item.product_slug}`}
        className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:h-24 sm:w-24"
      >
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.product_name}
            fill
            unoptimized
            sizes="96px"
            onLoad={() => setImageLoaded(true)}
            className={`object-cover transition-opacity duration-200 ease-out ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-muted">
            Нет фото
          </div>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 basis-full sm:basis-auto">
        <Link
          href={`/product/${item.product_slug}`}
          className="text-sm font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {item.product_name}
        </Link>
        {optionsLabel && (
          <p className="flex items-center gap-2 text-[13px] text-ink-muted">
            {colorEntry && (
              <span
                aria-hidden="true"
                style={swatchStyle(String(colorEntry[1]))}
                className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-ink/15"
              />
            )}
            {optionsLabel}
          </p>
        )}

        {!item.is_available && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-1.5 self-start rounded-lg bg-accent-sale/10 px-2.5 py-1.5 text-[13px] font-medium text-accent-sale-700">
              <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Товара больше нет в наличии — не входит в итог
            </p>
            {status === "authenticated" && (
              <button
                type="button"
                onClick={() => {
                  toggleFavorite.mutate({ productId: item.product_id, isFavorite: false });
                  updateItem.mutate({ variantId: item.variant_id, qty: 0 });
                }}
                className="rounded-lg bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                В избранное
              </button>
            )}
          </div>
        )}
        {exceedsStock && (
          <p className="font-mono text-xs font-medium text-accent-sale-700">
            Доступно только {item.available_qty} шт.
          </p>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-4 sm:gap-6">
        <span className="hidden whitespace-nowrap font-mono text-[13px] text-ink-muted sm:inline">
          {formatPrice(item.price)}/шт
        </span>

        {!item.is_available ? null : (
          <>
            <div className="flex items-center rounded-lg border border-ink/15 overflow-hidden">
              <button
                type="button"
                aria-label="Уменьшить количество"
                onClick={() => updateItem.mutate({ variantId: item.variant_id, qty: item.qty - 1 })}
                disabled={updateItem.isPending}
                className="flex h-9 w-9 items-center justify-center text-ink hover:bg-surface disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                −
              </button>
              <span
                key={item.qty}
                className="animate-price-tick w-8 text-center font-mono text-sm font-semibold tabular-nums text-ink"
              >
                {item.qty}
              </span>
              <button
                type="button"
                aria-label="Увеличить количество"
                onClick={() => updateItem.mutate({ variantId: item.variant_id, qty: item.qty + 1 })}
                disabled={updateItem.isPending || item.qty >= 99}
                className="flex h-9 w-9 items-center justify-center text-ink hover:bg-surface disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                +
              </button>
            </div>
            <span
              key={item.line_total}
              className="animate-price-tick w-[90px] shrink-0 whitespace-nowrap text-right font-mono text-base font-bold text-ink sm:w-[110px] sm:text-[17px]"
            >
              {formatPrice(item.line_total)}
            </span>
          </>
        )}

        <button
          type="button"
          aria-label="Удалить из корзины"
          onClick={() => updateItem.mutate({ variantId: item.variant_id, qty: 0 })}
          disabled={updateItem.isPending}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Trash2 className="h-[17px] w-[17px]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
