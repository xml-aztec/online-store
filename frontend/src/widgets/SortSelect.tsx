"use client";

import { usePathname, useSearchParams } from "next/navigation";

import type { ProductSort } from "@/entities/product/api";
import { useCatalogTransition } from "@/shared/lib/catalogTransition";

const SORT_LABELS: Record<ProductSort, string> = {
  newest: "Сначала новые",
  popular: "По популярности",
  price_asc: "Сначала дешевле",
  price_desc: "Сначала дороже",
};

export function SortSelect({ value }: { value: ProductSort }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate } = useCatalogTransition();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", event.target.value);
    params.delete("page");
    navigate(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      aria-label="Сортировка"
      className="rounded-lg border border-ink/15 bg-bg px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
    >
      {(Object.keys(SORT_LABELS) as ProductSort[]).map((key) => (
        <option key={key} value={key}>
          {SORT_LABELS[key]}
        </option>
      ))}
    </select>
  );
}
