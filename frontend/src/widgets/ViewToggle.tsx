"use client";

import { LayoutGrid, List } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { useCatalogTransition } from "@/shared/lib/catalogTransition";

export type CatalogView = "grid" | "list";

export function ViewToggle({ value }: { value: CatalogView }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate } = useCatalogTransition();

  function setView(next: CatalogView) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "grid") {
      params.delete("view");
    } else {
      params.set("view", next);
    }
    navigate(`${pathname}${params.size > 0 ? `?${params.toString()}` : ""}`);
  }

  return (
    <div
      role="group"
      aria-label="Вид товаров"
      className="flex items-center gap-0.5 rounded-lg border border-ink/15 p-0.5"
    >
      <button
        type="button"
        onClick={() => setView("grid")}
        aria-pressed={value === "grid"}
        aria-label="Сетка"
        className={`flex h-8 w-8 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          value === "grid" ? "bg-brand/10 text-brand" : "text-ink-muted hover:text-ink"
        }`}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setView("list")}
        aria-pressed={value === "list"}
        aria-label="Список"
        className={`flex h-8 w-8 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          value === "list" ? "bg-brand/10 text-brand" : "text-ink-muted hover:text-ink"
        }`}
      >
        <List className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
