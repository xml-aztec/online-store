import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { findCategoryByPath, getCategoryTree, type CategoryNode } from "@/entities/category/api";
import { listProducts, type ProductSort } from "@/entities/product/api";
import { CategorySidebar } from "@/widgets/CategorySidebar";
import { FiltersForm } from "@/widgets/FiltersForm";
import { Pagination } from "@/widgets/Pagination";
import { ProductCard } from "@/widgets/ProductCard";
import { SortSelect } from "@/widgets/SortSelect";

const SORT_VALUES: ProductSort[] = ["newest", "popular", "price_asc", "price_desc"];
const PAGE_SIZE = 24;

type SearchParamsRecord = Record<string, string | string[] | undefined>;

interface CatalogPageProps {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<SearchParamsRecord>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseOptions(searchParams: SearchParamsRecord): Record<string, string[]> {
  const options: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    const match = /^options\[(.+)\]$/.exec(key);
    if (!match || value === undefined) continue;
    options[match[1]] = Array.isArray(value) ? value : [value];
  }
  return options;
}

function resolveCategory(tree: CategoryNode[], slug: string[]): CategoryNode | null {
  if (slug.length === 0) return null;
  return findCategoryByPath(tree, slug);
}

export async function generateMetadata({ params }: CatalogPageProps): Promise<Metadata> {
  const { slug = [] } = await params;
  if (slug.length === 0) return { title: "Каталог" };

  const tree = await getCategoryTree();
  const category = resolveCategory(tree, slug);
  return { title: category?.name ?? "Каталог" };
}

export default async function CatalogPage({ params, searchParams }: CatalogPageProps) {
  const { slug = [] } = await params;
  const sp = await searchParams;

  const tree = await getCategoryTree();
  let category: CategoryNode | null = null;
  if (slug.length > 0) {
    category = resolveCategory(tree, slug);
    if (!category) notFound();
  }

  const sortParam = firstValue(sp.sort);
  const sort: ProductSort = (SORT_VALUES as string[]).includes(sortParam ?? "")
    ? (sortParam as ProductSort)
    : "newest";
  const page = Math.max(1, Number(firstValue(sp.page)) || 1);

  const { items, total, facets } = await listProducts({
    category: category?.slug,
    q: firstValue(sp.q),
    price_min: firstValue(sp.price_min),
    price_max: firstValue(sp.price_max),
    options: parseOptions(sp),
    sort,
    page,
    page_size: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const basePath = slug.length > 0 ? `/catalog/${slug.join("/")}` : "/catalog";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        {category?.name ?? "Каталог"}
      </h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-6">
          <CategorySidebar tree={tree} activeSlugPath={slug} />
          <FiltersForm basePath={basePath} searchParams={sp} facets={facets} />
        </aside>

        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="text-sm text-zinc-500">Найдено: {total}</p>
            <SortSelect value={sort} />
          </div>

          {items.length === 0 ? (
            <p className="py-12 text-center text-zinc-500">Ничего не найдено</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          <Pagination basePath={basePath} searchParams={sp} page={page} totalPages={totalPages} />
        </div>
      </div>
    </div>
  );
}
