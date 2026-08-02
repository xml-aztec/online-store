import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { findCategoryByPath, getCategoryTree, type CategoryNode } from "@/entities/category/api";
import { listProducts, type ProductSort } from "@/entities/product/api";
import { CategorySidebar } from "@/widgets/CategorySidebar";
import { FiltersForm } from "@/widgets/FiltersForm";
import { MobileFiltersSheet } from "@/widgets/MobileFiltersSheet";
import { Pagination } from "@/widgets/Pagination";
import { ProductCard } from "@/widgets/ProductCard";
import { SortSelect } from "@/widgets/SortSelect";
import { type CatalogView, ViewToggle } from "@/widgets/ViewToggle";

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

function buildBreadcrumb(
  tree: CategoryNode[],
  slug: string[]
): { name: string; path: string }[] {
  const crumbs: { name: string; path: string }[] = [];
  let nodes = tree;
  const cumulative: string[] = [];

  for (const segment of slug) {
    const node = nodes.find((candidate) => candidate.slug === segment);
    if (!node) break;
    cumulative.push(segment);
    crumbs.push({ name: node.name, path: cumulative.join("/") });
    nodes = node.children;
  }

  return crumbs;
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
  const view: CatalogView = firstValue(sp.view) === "list" ? "list" : "grid";
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
  const breadcrumb = buildBreadcrumb(tree, slug);

  const filtersContent = (
    <div className="space-y-4">
      <CategorySidebar tree={tree} activeSlugPath={slug} />
      <div className="rounded-xl border border-ink/10 p-4">
        <FiltersForm basePath={basePath} searchParams={sp} facets={facets} />
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <nav aria-label="Хлебные крошки" className="mb-3 flex flex-wrap items-center gap-1 text-sm text-ink-muted">
        {breadcrumb.length === 0 ? (
          <span className="text-ink">Каталог</span>
        ) : (
          <Link
            href="/catalog"
            className="hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Каталог
          </Link>
        )}
        {breadcrumb.map((crumb, index) => (
          <span key={crumb.path} className="flex items-center gap-1">
            <span aria-hidden="true">/</span>
            {index === breadcrumb.length - 1 ? (
              <span className="text-ink">{crumb.name}</span>
            ) : (
              <Link
                href={`/catalog/${crumb.path}`}
                className="hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {crumb.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <h1 className="font-display text-xl font-bold text-ink sm:text-2xl">
        {category?.name ?? "Каталог"}
      </h1>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr] lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-24">{filtersContent}</div>
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-sm text-ink-muted">
              Найдено <span className="text-ink">{total}</span> {total === 1 ? "товар" : "товаров"}
            </p>
            <div className="flex items-center gap-2">
              <div className="lg:hidden">
                <MobileFiltersSheet>{filtersContent}</MobileFiltersSheet>
              </div>
              <ViewToggle value={view} />
              <SortSelect value={sort} />
            </div>
          </div>

          {items.length === 0 ? (
            <p className="py-12 text-center text-ink-muted">Ничего не найдено</p>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
              {items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((product) => (
                <ProductCard key={product.id} product={product} layout="list" />
              ))}
            </div>
          )}

          <Pagination basePath={basePath} searchParams={sp} page={page} totalPages={totalPages} />
        </div>
      </div>
    </div>
  );
}
