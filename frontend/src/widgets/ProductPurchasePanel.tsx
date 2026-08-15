"use client";

import { useMemo, useState } from "react";

import { useAddCartItemMutation } from "@/entities/cart/queries";
import type { ProductVariant } from "@/entities/product/api";
import { formatPrice } from "@/shared/lib/formatPrice";
import { isColorFacet, resolveSwatchColor, swatchStyle } from "@/shared/lib/colorSwatches";
import { optionLabel } from "@/shared/lib/optionLabels";
import { isLowStock, stockLabel as sharedStockLabel } from "@/shared/lib/stock";
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
  /** The quick view modal shows the heart up top next to the close button
   * instead, so it passes false here to avoid a second one by the CTA. */
  showFavorite?: boolean;
  /** "page" (default) renders the full sticky-column header (title, rating,
   * review-count link, SKU) plus a mobile sticky-bottom purchase bar --
   * matches the standalone product page design. "compact" skips both: quick
   * view already renders its own title/rating above this panel and lives
   * inside a modal sheet, not a real page, so a page-level sticky bar
   * doesn't belong there. */
  variant?: "page" | "compact";
  /** Real flat courier cost from `/checkout/config` -- omit to hide the
   * delivery line rather than guess at a number. */
  courierCost?: string | number;
}

export function ProductPurchasePanel({
  variants,
  productId,
  productName,
  productSlug,
  imageUrl,
  showFavorite = true,
  variant = "page",
  courierCost,
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
  const lowStock = Boolean(
    selectedVariant && isLowStock(selectedVariant.stock_qty, selectedVariant.is_available)
  );
  const colorSelected = axes.some((axis) => isColorFacet(axis.key));

  function isValueAvailable(axisKey: string, value: string): boolean {
    const candidate = { ...selection, [axisKey]: value };
    return variants.some((v) => v.is_active && optionsMatch(v, candidate));
  }

  function handleAddToCart() {
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
  }

  return (
    <div className="space-y-5 lg:sticky lg:top-24" data-testid="product-purchase-panel">
      {variant === "page" && (
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold text-ink">{productName}</h1>
          <div className="flex flex-wrap items-center gap-3">
            {selectedVariant && (
              <span className="font-mono text-xs text-ink-muted">SKU {selectedVariant.sku}</span>
            )}
          </div>
        </div>
      )}

      {axes.map((axis) => {
        const asColor = isColorFacet(axis.key);
        return (
          <div key={axis.key}>
            <p className="mb-2 text-sm font-medium text-ink">{optionLabel(axis.key)}</p>
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

      <div className={`space-y-3.5 ${variant === "page" ? "rounded-xl bg-surface p-5" : ""}`}>
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

        <p
          className={
            available
              ? lowStock
                ? "text-sm font-semibold text-accent-sale-700"
                : "text-sm font-medium text-success-700"
              : "text-sm font-medium text-ink-muted"
          }
        >
          {available && lowStock && selectedVariant
            ? `Осталось ${selectedVariant.stock_qty} шт.${colorSelected ? " в этом цвете" : ""}`
            : stockLabel(selectedVariant)}
        </p>

        <div className="hidden gap-3 lg:flex">
          <button
            type="button"
            disabled={!available || addItem.isPending}
            onClick={handleAddToCart}
            className="flex-1 rounded-lg bg-brand px-4 py-3 font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {addItem.isPending ? "Добавляем…" : "Добавить в корзину"}
          </button>
          {showFavorite && <FavoriteButton productId={productId} size="lg" />}
        </div>

        {addItem.isSuccess && <p className="text-sm text-success-700">Добавлено в корзину</p>}
        {addItem.isError && <p className="text-sm text-accent-sale-700">{addItem.error.message}</p>}

        {courierCost !== undefined && (
          <div className="flex flex-col gap-1.5 text-[13px] text-ink-muted">
            <span className="flex items-center gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-success"
                aria-hidden="true"
              >
                <path d="M5 12l4 4L19 6" />
              </svg>
              Доставка курьером — {formatPrice(String(courierCost))}
            </span>
            <span className="flex items-center gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-success"
                aria-hidden="true"
              >
                <path d="M5 12l4 4L19 6" />
              </svg>
              Самовывоз — бесплатно
            </span>
          </div>
        )}
      </div>

      {variant === "page" && (
        <div
          // Sits directly above BottomNav (site-wide mobile tab bar, ~55.5px
          // content height + its own safe-area padding) -- not bottom-0,
          // which would stack the two fixed bars on top of each other.
          className="fixed inset-x-0 z-30 flex gap-2.5 border-t border-border bg-bg p-3 shadow-[0_-4px_16px_rgba(20,22,26,0.08)] lg:hidden"
          style={{ bottom: "calc(55.5px + env(safe-area-inset-bottom))" }}
        >
          {showFavorite && <FavoriteButton productId={productId} size="lg" />}
          <button
            type="button"
            disabled={!available || addItem.isPending}
            onClick={handleAddToCart}
            className="flex-1 rounded-lg bg-brand px-4 font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {addItem.isPending
              ? "Добавляем…"
              : `В корзину${selectedVariant ? ` · ${formatPrice(selectedVariant.price)}` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
