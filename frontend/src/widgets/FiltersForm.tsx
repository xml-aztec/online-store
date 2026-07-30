import Form from "next/form";

import type { FacetsResponse } from "@/entities/product/api";

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

export function FiltersForm({ basePath, searchParams, facets }: FiltersFormProps) {
  const optionEntries = Object.entries(facets.options);
  const q = firstValue(searchParams.q);
  const sort = firstValue(searchParams.sort);

  return (
    <Form
      action={basePath}
      className="space-y-5 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800"
    >
      {q && <input type="hidden" name="q" value={q} />}
      {sort && <input type="hidden" name="sort" value={sort} />}

      <div>
        <p className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">Цена, сом</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            name="price_min"
            min={0}
            placeholder={facets.price_min ?? "от"}
            defaultValue={firstValue(searchParams.price_min)}
            className="w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span className="text-zinc-400">–</span>
          <input
            type="number"
            name="price_max"
            min={0}
            placeholder={facets.price_max ?? "до"}
            defaultValue={firstValue(searchParams.price_max)}
            className="w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      </div>

      {optionEntries.map(([key, values]) => {
        const selected = selectedOptionValues(searchParams, key);
        return (
          <div key={key}>
            <p className="mb-2 font-medium capitalize text-zinc-900 dark:text-zinc-100">{key}</p>
            <div className="space-y-1">
              {values.map((value) => (
                <label key={value} className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    name={`options[${key}]`}
                    value={value}
                    defaultChecked={selected.has(value)}
                  />
                  {value}
                </label>
              ))}
            </div>
          </div>
        );
      })}

      <button
        type="submit"
        className="w-full rounded bg-zinc-900 px-3 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Применить
      </button>
    </Form>
  );
}
