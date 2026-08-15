"use client";

import { useCatalogTransition } from "@/shared/lib/catalogTransition";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

interface PaginationProps {
  basePath: string;
  searchParams: SearchParamsRecord;
  page: number;
  totalPages: number;
}

function hrefForPage(basePath: string, searchParams: SearchParamsRecord, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      params.append(key, v);
    }
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function Pagination({ basePath, searchParams, page, totalPages }: PaginationProps) {
  const { navigate } = useCatalogTransition();

  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <nav aria-label="Пагинация" className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm">
      {pages.map((p) => {
        const href = hrefForPage(basePath, searchParams, p);
        return (
          <a
            key={p}
            href={href}
            aria-current={p === page ? "page" : undefined}
            onClick={(event) => {
              // Let modifier-clicks (open in new tab, etc.) fall through to
              // the browser's native handling -- only intercept a plain
              // left-click to route it through the shared transition.
              if (event.defaultPrevented || event.button !== 0) return;
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              navigate(href);
            }}
            className={`rounded-lg px-3 py-1 font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              p === page
                ? "bg-brand text-white"
                : "border border-ink/15 text-ink-muted hover:border-brand/40 hover:text-ink"
            }`}
          >
            {p}
          </a>
        );
      })}
    </nav>
  );
}
