import { ChevronDown } from "lucide-react";
import Form from "next/form";

import type { FacetsResponse } from "@/entities/product/api";
import { isColorFacet, resolveSwatchColor } from "@/shared/lib/colorSwatches";

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

export function FiltersForm({ basePath, searchParams, facets }: FiltersFormProps) {
  const optionEntries = Object.entries(facets.options);
  const q = firstValue(searchParams.q);
  const sort = firstValue(searchParams.sort);
  const view = firstValue(searchParams.view);

  return (
    <Form action={basePath} className="text-sm">
      {q && <input type="hidden" name="q" value={q} />}
      {sort && <input type="hidden" name="sort" value={sort} />}
      {view && <input type="hidden" name="view" value={view} />}

      <FilterSection title="Цена, сом">
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="price_min">
            Цена от
          </label>
          <input
            id="price_min"
            type="number"
            name="price_min"
            min={0}
            placeholder={facets.price_min ?? "от"}
            defaultValue={firstValue(searchParams.price_min)}
            className="w-full rounded-lg border border-ink/15 bg-bg px-2.5 py-1.5 text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <span className="text-ink-muted" aria-hidden="true">
            –
          </span>
          <label className="sr-only" htmlFor="price_max">
            Цена до
          </label>
          <input
            id="price_max"
            type="number"
            name="price_max"
            min={0}
            placeholder={facets.price_max ?? "до"}
            defaultValue={firstValue(searchParams.price_max)}
            className="w-full rounded-lg border border-ink/15 bg-bg px-2.5 py-1.5 text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
      </FilterSection>

      {optionEntries.map(([key, values]) => {
        const selected = selectedOptionValues(searchParams, key);
        const asColor = isColorFacet(key);

        return (
          <FilterSection key={key} title={key}>
            <div className="flex flex-wrap gap-2">
              {values.map((value) => {
                const checked = selected.has(value);
                const swatch = asColor ? resolveSwatchColor(value) : null;

                if (asColor) {
                  const isTransparent = swatch === "transparent";
                  const swatchStyle: React.CSSProperties | undefined = isTransparent
                    ? {
                        background:
                          "linear-gradient(135deg, transparent 46%, #d1d5db 46%, #d1d5db 54%, transparent 54%)",
                      }
                    : swatch
                      ? { backgroundColor: swatch }
                      : undefined;

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
                        style={swatchStyle}
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
    </Form>
  );
}
