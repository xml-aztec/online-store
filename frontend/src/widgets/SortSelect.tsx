"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { ProductSort } from "@/entities/product/api";

const SORT_LABELS: Record<ProductSort, string> = {
  newest: "Сначала новые",
  popular: "По популярности",
  price_asc: "Сначала дешевле",
  price_desc: "Сначала дороже",
};

export function SortSelect({ value }: { value: ProductSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", event.target.value);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      aria-label="Сортировка"
      className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
      {(Object.keys(SORT_LABELS) as ProductSort[]).map((key) => (
        <option key={key} value={key}>
          {SORT_LABELS[key]}
        </option>
      ))}
    </select>
  );
}
