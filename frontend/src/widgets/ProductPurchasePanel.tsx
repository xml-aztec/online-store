"use client";

import { useMemo, useState } from "react";

import { useAddCartItemMutation } from "@/entities/cart/queries";
import type { ProductVariant } from "@/entities/product/api";
import { formatPrice } from "@/shared/lib/formatPrice";

interface Axis {
  key: string;
  values: string[];
}

function optionsMatch(variant: ProductVariant, selection: Record<string, string>): boolean {
  return Object.entries(selection).every(
    ([key, value]) => String(variant.options[key] ?? "") === value
  );
}

function getAxes(variants: ProductVariant[]): Axis[] {
  const axisValues = new Map<string, Set<string>>();
  for (const variant of variants) {
    for (const [key, value] of Object.entries(variant.options)) {
      if (!axisValues.has(key)) axisValues.set(key, new Set());
      axisValues.get(key)?.add(String(value));
    }
  }
  return Array.from(axisValues.entries()).map(([key, values]) => ({
    key,
    values: Array.from(values),
  }));
}

function defaultSelection(variants: ProductVariant[], axes: Axis[]): Record<string, string> {
  const preferred = variants.find((variant) => variant.is_available) ?? variants[0];
  const selection: Record<string, string> = {};
  for (const axis of axes) {
    selection[axis.key] = preferred ? String(preferred.options[axis.key] ?? "") : (axis.values[0] ?? "");
  }
  return selection;
}

function stockLabel(variant: ProductVariant | undefined): string {
  if (!variant || !variant.is_available || variant.stock_qty <= 0) return "Нет в наличии";
  if (variant.stock_qty <= 5) return `Осталось ${variant.stock_qty} шт.`;
  return "В наличии";
}

interface ProductPurchasePanelProps {
  variants: ProductVariant[];
  productId: string;
  productName: string;
  productSlug: string;
  imageUrl: string | null;
}

export function ProductPurchasePanel({
  variants,
  productId,
  productName,
  productSlug,
  imageUrl,
}: ProductPurchasePanelProps) {
  const axes = useMemo(() => getAxes(variants), [variants]);
  const [selection, setSelection] = useState<Record<string, string>>(() =>
    defaultSelection(variants, axes)
  );
  const addItem = useAddCartItemMutation();

  const selectedVariant = variants.find((variant) => optionsMatch(variant, selection));
  const available = Boolean(
    selectedVariant && selectedVariant.is_available && selectedVariant.stock_qty > 0
  );

  function isValueAvailable(axisKey: string, value: string): boolean {
    const candidate = { ...selection, [axisKey]: value };
    return variants.some((variant) => variant.is_active && optionsMatch(variant, candidate));
  }

  return (
    <div className="space-y-5">
      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {selectedVariant ? formatPrice(selectedVariant.price) : "—"}
      </p>

      {axes.map((axis) => (
        <div key={axis.key}>
          <p className="mb-2 text-sm font-medium capitalize text-zinc-900 dark:text-zinc-100">
            {axis.key}
          </p>
          <div className="flex flex-wrap gap-2">
            {axis.values.map((value) => {
              const isSelected = selection[axis.key] === value;
              const isEnabled = isValueAvailable(axis.key, value);
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isEnabled}
                  onClick={() => setSelection((prev) => ({ ...prev, [axis.key]: value }))}
                  className={`rounded border px-3 py-1.5 text-sm ${
                    isSelected
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                  } ${!isEnabled ? "cursor-not-allowed opacity-40 line-through" : ""}`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p
        className={
          available
            ? "text-sm font-medium text-emerald-600 dark:text-emerald-400"
            : "text-sm font-medium text-zinc-500"
        }
      >
        {stockLabel(selectedVariant)}
      </p>

      <button
        type="button"
        disabled={!available || addItem.isPending}
        onClick={() => {
          if (!selectedVariant) return;
          addItem.mutate({
            variantId: selectedVariant.id,
            qty: 1,
            newItem: {
              product_id: productId,
              product_name: productName,
              product_slug: productSlug,
              sku: selectedVariant.sku,
              options: selectedVariant.options,
              image_url: imageUrl,
              price: selectedVariant.price,
            },
          });
        }}
        className="w-full rounded bg-zinc-900 px-4 py-3 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {addItem.isPending ? "Добавляем…" : "Добавить в корзину"}
      </button>

      {addItem.isSuccess && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Добавлено в корзину</p>
      )}
      {addItem.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">{addItem.error.message}</p>
      )}
    </div>
  );
}
