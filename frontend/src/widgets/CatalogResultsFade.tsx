"use client";

import type { ReactNode } from "react";

import { useCatalogTransition } from "@/shared/lib/catalogTransition";

/** Dims its children (opacity only, still fully interactive) while a
 * filter/sort/page change is in flight, instead of the results just
 * snapping to the new list -- or, on a slow connection, sitting frozen
 * with no feedback at all until the new RSC payload lands. */
export function CatalogResultsFade({ children }: { children: ReactNode }) {
  const { isPending } = useCatalogTransition();
  return (
    <div
      aria-busy={isPending}
      className={`transition-opacity duration-200 ease-out ${isPending ? "opacity-50" : "opacity-100"}`}
    >
      {children}
    </div>
  );
}
