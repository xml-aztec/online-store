"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { CartItem } from "@/entities/cart/api";
import { useUpdateCartItemMutation } from "@/entities/cart/queries";
import { formatPrice } from "@/shared/lib/formatPrice";

export function CartItemRow({ item }: { item: CartItem }) {
  const updateItem = useUpdateCartItemMutation();

  const optionsLabel = Object.values(item.options).map(String).join(", ");
  const exceedsStock = item.is_available && item.qty > item.available_qty;

  return (
    <div className="flex gap-4 border-b border-ink/10 py-4 last:border-0">
      <Link
        href={`/product/${item.product_slug}`}
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.product_name}
            fill
            unoptimized
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-muted">
            Нет фото
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1">
        <Link
          href={`/product/${item.product_slug}`}
          className="text-sm font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {item.product_name}
        </Link>
        {optionsLabel && <p className="text-xs text-ink-muted">{optionsLabel}</p>}
        <p className="font-mono text-sm font-medium text-ink">{formatPrice(item.price)}</p>

        {!item.is_available && (
          <p className="text-xs font-medium text-accent-sale-700">Товар закончился</p>
        )}
        {exceedsStock && (
          <p className="font-mono text-xs font-medium text-accent-sale-700">
            Доступно только {item.available_qty} шт.
          </p>
        )}

        <div className="mt-2 flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-ink/15">
            <button
              type="button"
              aria-label="Уменьшить количество"
              onClick={() => updateItem.mutate({ variantId: item.variant_id, qty: item.qty - 1 })}
              disabled={updateItem.isPending}
              className="flex h-8 w-8 items-center justify-center rounded-l-lg text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              −
            </button>
            <span className="w-6 text-center font-mono text-sm tabular-nums text-ink">
              {item.qty}
            </span>
            <button
              type="button"
              aria-label="Увеличить количество"
              onClick={() => updateItem.mutate({ variantId: item.variant_id, qty: item.qty + 1 })}
              disabled={updateItem.isPending || item.qty >= 99}
              className="flex h-8 w-8 items-center justify-center rounded-r-lg text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              +
            </button>
          </div>
          <button
            type="button"
            aria-label="Удалить из корзины"
            onClick={() => updateItem.mutate({ variantId: item.variant_id, qty: 0 })}
            disabled={updateItem.isPending}
            className="rounded-lg p-1.5 text-ink-muted hover:text-accent-sale-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="shrink-0 font-mono text-sm font-semibold text-ink">
        {formatPrice(item.line_total)}
      </p>
    </div>
  );
}
