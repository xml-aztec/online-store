import Link from "next/link";

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
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <nav aria-label="Пагинация" className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm">
      {pages.map((p) => (
        <Link
          key={p}
          href={hrefForPage(basePath, searchParams, p)}
          aria-current={p === page ? "page" : undefined}
          className={`rounded-lg px-3 py-1 font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
            p === page
              ? "bg-brand text-white"
              : "border border-ink/15 text-ink-muted hover:border-brand/40 hover:text-ink"
          }`}
        >
          {p}
        </Link>
      ))}
    </nav>
  );
}
