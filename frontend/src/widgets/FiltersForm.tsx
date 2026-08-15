"use client";

import { ChevronDown } from "lucide-react";

import type { FacetsResponse } from "@/entities/product/api";
import { isColorFacet, resolveSwatchColor, swatchStyle } from "@/shared/lib/colorSwatches";
import { optionLabel } from "@/shared/lib/optionLabels";
import { useCatalogTransition } from "@/shared/lib/catalogTransition";
import { PriceRangeSlider } from "@/shared/ui/PriceRangeSlider";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

interface FiltersFormProps {
  basePath: string;
  searchParams: SearchParamsRecord;
  facets: FacetsResponse;
}

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function selectedOptionValues(searchParams: SearchParamsRecord, key: string): Set<string> {
  const raw = searchParams[`options[${key}]`];
  if (raw === undefined) return new Set();
  return new Set(Array.isArray(raw) ? raw : [raw]);
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details
      open
      className="group border-b border-ink/10 py-4 first:pt-0 last:border-b-0 last:pb-0"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between font-display text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 text-ink-muted transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

const ACTIVE_FILTER_KEYS = ["price_min", "price_max", "in_stock", "on_sale"];

function hasActiveFilters(searchParams: SearchParamsRecord): boolean {
  if (ACTIVE_FILTER_KEYS.some((key) => searchParams[key])) return true;
  return Object.keys(searchParams).some((key) => key.startsWith("options["));
}

export function FiltersForm({ basePath, searchParams, facets }: FiltersFormProps) {
  const { navigate } = useCatalogTransition();
  const optionEntries = Object.entries(facets.options);
  const q = firstValue(searchParams.q);
  const sort = firstValue(searchParams.sort);
  const view = firstValue(searchParams.view);
  const priceMin = facets.price_min != null ? Number(facets.price_min) : null;
  const priceMax = facets.price_max != null ? Number(facets.price_max) : null;

  // Same "GET form" semantics next/form's <Form> gave us (serialize every
  // named field, hidden inputs carry over q/sort/view) -- just dispatched
  // through the shared transition instead of a native form navigation, so
  // it participates in the same isPending the other controls do.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget).entries()) {
      if (typeof value === "string" && value) params.append(key, value);
    }
    const query = params.toString();
    navigate(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <form onSubmit={handleSubmit} className="text-sm">
      {q && <input type="hidden" name="q" value={q} />}
      {sort && <input type="hidden" name="sort" value={sort} />}
      {view && <input type="hidden" name="view" value={view} />}

      <FilterSection title="Цена, сом">
        {priceMin != null && priceMax != null ? (
          <PriceRangeSlider
            min={priceMin}
            max={priceMax}
            defaultMin={
              firstValue(searchParams.price_min)
                ? Number(firstValue(searchParams.price_min))
                : priceMin
            }
            defaultMax={
              firstValue(searchParams.price_max)
                ? Number(firstValue(searchParams.price_max))
                : priceMax
            }
          />
        ) : (
          <p className="text-ink-muted">Нет товаров для фильтрации по цене</p>
        )}
      </FilterSection>

      <FilterSection title="Наличие">
        <div className="flex flex-col gap-2.5">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              name="in_stock"
              value="true"
              defaultChecked={firstValue(searchParams.in_stock) === "true"}
              className="h-[18px] w-[18px] rounded border-ink/25 text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
            Только в наличии
          </label>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              name="on_sale"
              value="true"
              defaultChecked={firstValue(searchParams.on_sale) === "true"}
              className="h-[18px] w-[18px] rounded border-ink/25 text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
            Со скидкой
          </label>
        </div>
      </FilterSection>

      {optionEntries.map(([key, values]) => {
        const selected = selectedOptionValues(searchParams, key);
        const asColor = isColorFacet(key);

        return (
          <FilterSection key={key} title={optionLabel(key)}>
            <div className="flex flex-wrap gap-2">
              {values.map((value) => {
                const checked = selected.has(value);
                const swatch = asColor ? resolveSwatchColor(value) : null;

                if (asColor) {
                  return (
                    <label
                      key={value}
                      title={value}
                      className="relative flex cursor-pointer items-center justify-center"
                    >
                      <input
                        type="checkbox"
                        name={`options[${key}]`}
                        value={value}
                        defaultChecked={checked}
                        className="peer sr-only"
                      />
                      <span
                        style={swatchStyle(value)}
                        className={`flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-inset ring-ink/15 peer-checked:ring-2 peer-checked:ring-brand peer-checked:ring-offset-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand ${
                          !swatch ? "bg-surface" : ""
                        }`}
                      >
                        {!swatch && (
                          <span className="text-[10px] font-medium text-ink-muted">
                            {value.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="sr-only">{value}</span>
                    </label>
                  );
                }

                return (
                  <label key={value} className="cursor-pointer">
                    <input
                      type="checkbox"
                      name={`options[${key}]`}
                      value={value}
                      defaultChecked={checked}
                      className="peer sr-only"
                    />
                    <span className="inline-flex items-center rounded-lg border border-ink/15 px-3 py-1.5 text-ink-muted peer-checked:border-brand peer-checked:bg-brand/10 peer-checked:text-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                      {value}
                    </span>
                  </label>
                );
              })}
            </div>
          </FilterSection>
        );
      })}

      <button
        type="submit"
        className="mt-4 w-full rounded-lg bg-brand px-3 py-2.5 font-medium text-white hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Применить
      </button>

      {hasActiveFilters(searchParams) && (
        <a
          href={q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath}
          onClick={(event) => {
            if (event.defaultPrevented || event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            navigate(q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath);
          }}
          className="mt-3 block text-center font-medium text-brand hover:text-brand/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Сбросить фильтры
        </a>
      )}
    </form>
  );
}
