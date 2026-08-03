"use client";

import { useMemo, useState } from "react";

import { useAddCartItemMutation } from "@/entities/cart/queries";
import type { ProductVariant } from "@/entities/product/api";
import { formatPrice } from "@/shared/lib/formatPrice";
import { isColorFacet, resolveSwatchColor, swatchStyle } from "@/shared/lib/colorSwatches";
import { stockLabel as sharedStockLabel } from "@/shared/lib/stock";
import { FavoriteButton } from "@/shared/ui/FavoriteButton";

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
  if (!variant) return "Нет в наличии";
  return sharedStockLabel(variant.stock_qty, variant.is_available);
}

function discountPercent(variant: ProductVariant | undefined): number | null {
  if (!variant?.compare_at_price) return null;
  const price = Number(variant.price);
  const comparePrice = Number(variant.compare_at_price);
  if (!(comparePrice > price)) return null;
  return Math.round((1 - price / comparePrice) * 100);
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
  const discount = discountPercent(selectedVariant);

  function isValueAvailable(axisKey: string, value: string): boolean {
    const candidate = { ...selection, [axisKey]: value };
    return variants.some((variant) => variant.is_active && optionsMatch(variant, candidate));
  }

  return (
    <div className="space-y-5 lg:sticky lg:top-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p
            key={selectedVariant?.id ?? "none"}
            className="animate-price-tick font-mono text-2xl font-semibold text-ink"
          >
            {selectedVariant ? formatPrice(selectedVariant.price) : "—"}
          </p>
          {discount !== null && selectedVariant?.compare_at_price && (
            <>
              <p className="font-mono text-base text-ink-muted line-through">
                {formatPrice(selectedVariant.compare_at_price)}
              </p>
              <span className="rounded-lg bg-accent-sale px-2 py-0.5 text-xs font-semibold text-white">
                -{discount}%
              </span>
            </>
          )}
        </div>
        <FavoriteButton productId={productId} className="border border-ink/10" />
      </div>

      {axes.map((axis) => {
        const asColor = isColorFacet(axis.key);
        return (
          <div key={axis.key}>
            <p className="mb-2 text-sm font-medium capitalize text-ink">{axis.key}</p>
            <div className="flex flex-wrap gap-2">
              {axis.values.map((value) => {
                const isSelected = selection[axis.key] === value;
                const isEnabled = isValueAvailable(axis.key, value);
                const swatch = asColor ? resolveSwatchColor(value) : null;

                if (asColor) {
                  return (
                    <button
                      key={value}
                      type="button"
                      title={value}
                      disabled={!isEnabled}
                      onClick={() => setSelection((prev) => ({ ...prev, [axis.key]: value }))}
                      className={`relative flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                        isSelected ? "ring-2 ring-brand ring-offset-2" : "ring-ink/15"
                      } ${!isEnabled ? "cursor-not-allowed opacity-30" : ""} ${!swatch ? "bg-surface" : ""}`}
                      style={swatchStyle(value)}
                    >
                      {!swatch && (
                        <span className="text-[10px] font-medium text-ink-muted">
                          {value.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="sr-only">{value}</span>
                    </button>
                  );
                }

                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!isEnabled}
                    onClick={() => setSelection((prev) => ({ ...prev, [axis.key]: value }))}
                    className={`rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                      isSelected
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-ink/15 text-ink-muted"
                    } ${!isEnabled ? "cursor-not-allowed opacity-40 line-through" : ""}`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <p
        className={
          available ? "text-sm font-medium text-success-700" : "text-sm font-medium text-ink-muted"
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
        className="w-full rounded-lg bg-brand px-4 py-3 font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {addItem.isPending ? "Добавляем…" : "Добавить в корзину"}
      </button>

      {addItem.isSuccess && <p className="text-sm text-success-700">Добавлено в корзину</p>}
      {addItem.isError && <p className="text-sm text-accent-sale-700">{addItem.error.message}</p>}
    </div>
  );
}
