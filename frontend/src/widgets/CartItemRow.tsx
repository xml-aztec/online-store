"use client";

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
    <div className="flex gap-4 border-b border-zinc-200 py-4 dark:border-zinc-800">
      <Link
        href={`/product/${item.product_slug}`}
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800"
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
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">
            Нет фото
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1">
        <Link
          href={`/product/${item.product_slug}`}
          className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100"
        >
          {item.product_name}
        </Link>
        {optionsLabel && <p className="text-xs text-zinc-500">{optionsLabel}</p>}
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {formatPrice(item.price)}
        </p>

        {!item.is_available && (
          <p className="text-xs font-medium text-red-600 dark:text-red-400">Товар закончился</p>
        )}
        {exceedsStock && (
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Доступно только {item.available_qty} шт.
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            aria-label="Уменьшить количество"
            onClick={() => updateItem.mutate({ variantId: item.variant_id, qty: item.qty - 1 })}
            disabled={updateItem.isPending}
            className="h-8 w-8 rounded border border-zinc-300 text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            −
          </button>
          <span className="w-8 text-center text-sm">{item.qty}</span>
          <button
            type="button"
            aria-label="Увеличить количество"
            onClick={() => updateItem.mutate({ variantId: item.variant_id, qty: item.qty + 1 })}
            disabled={updateItem.isPending || item.qty >= 99}
            className="h-8 w-8 rounded border border-zinc-300 text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => updateItem.mutate({ variantId: item.variant_id, qty: 0 })}
            disabled={updateItem.isPending}
            className="ml-2 text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Удалить
          </button>
        </div>
      </div>

      <p className="shrink-0 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {formatPrice(item.line_total)}
      </p>
    </div>
  );
}
