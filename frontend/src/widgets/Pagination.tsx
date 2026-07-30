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
          className={
            p === page
              ? "rounded bg-zinc-900 px-3 py-1 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "rounded border border-zinc-300 px-3 py-1 text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
          }
        >
          {p}
        </Link>
      ))}
    </nav>
  );
}
