import { Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getCategoryTree, type CategoryNode } from "@/entities/category/api";
import { listProducts, type ListProductsParams, type ProductListResponse } from "@/entities/product/api";
import { resolveCategoryIcon } from "@/shared/lib/categoryIcons";
import { HeroCarousel } from "@/widgets/HeroCarousel";
import { ProductCard } from "@/widgets/ProductCard";
import { ProductCarousel } from "@/widgets/ProductCarousel";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Главная",
};

const EMPTY_PRODUCT_LIST: ProductListResponse = {
  items: [],
  total: 0,
  page: 1,
  page_size: 0,
  facets: { price_min: null, price_max: null, options: {} },
};

const CAROUSEL_ITEM_CLASS = "w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%]";

// The homepage is eligible for static prerendering at build time (no dynamic
// APIs used), which means `next build` fetches this data with no live backend
// guaranteed to be reachable yet (e.g. a standalone `docker build` in CI, or a
// production image built before the backend service exists). Fall back to an
// empty state so the build succeeds with just the banner; real ISR traffic
// against a live backend fills in the actual sections within `revalidate`.
async function safeCategoryTree(): Promise<CategoryNode[]> {
  try {
    return await getCategoryTree();
  } catch {
    return [];
  }
}

async function safeProductList(params: ListProductsParams): Promise<ProductListResponse> {
  try {
    return await listProducts(params);
  } catch {
    return { ...EMPTY_PRODUCT_LIST, page_size: params.page_size ?? 0 };
  }
}

function HeroSlide({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-64 grid-cols-1 items-center gap-6 overflow-hidden bg-surface px-6 py-10 sm:min-h-80 sm:grid-cols-[1fr_auto] sm:px-10 sm:py-14">
      {children}
    </div>
  );
}

function HeroDecoration({ Icon }: { Icon: typeof Package }) {
  return (
    <Icon
      aria-hidden="true"
      className="mx-auto hidden h-32 w-32 text-brand/15 sm:block sm:h-48 sm:w-48"
    />
  );
}

export default async function HomePage() {
  const categories = await safeCategoryTree();
  const featuredCategory = categories[0];

  const [newest, popular, featured] = await Promise.all([
    safeProductList({ sort: "newest", page_size: 10 }),
    safeProductList({ sort: "popular", page_size: 10 }),
    featuredCategory
      ? safeProductList({ category: featuredCategory.slug, sort: "newest", page_size: 10 })
      : Promise.resolve(EMPTY_PRODUCT_LIST),
  ]);

  const heroSlides = [
    <HeroSlide key="intro">
      <div className="flex flex-col items-start gap-4">
        <span className="rounded-lg bg-accent-sale px-2.5 py-1 text-xs font-bold text-white">
          Доставка по Бишкеку за 1 день
        </span>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-4xl">
          Товары для дома HobbyLife
        </h1>
        <p className="max-w-xl text-ink-muted">
          Посуда и пищевые контейнеры, товары для кухни и хранения с доставкой по Бишкеку.
        </p>
        <Link
          href="/catalog"
          className="rounded-lg bg-ink px-6 py-3 text-sm font-medium text-white hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Смотреть каталог
        </Link>
      </div>
      <HeroDecoration Icon={Package} />
    </HeroSlide>,
    ...categories.slice(0, 2).map((category) => {
      const Icon = resolveCategoryIcon(category.name);
      return (
        <HeroSlide key={category.id}>
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm font-medium uppercase tracking-wide text-brand">Категория</p>
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-4xl">
              {category.name}
            </h2>
            <Link
              href={`/catalog/${category.slug}`}
              className="rounded-lg bg-ink px-6 py-3 text-sm font-medium text-white hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Смотреть товары
            </Link>
          </div>
          <HeroDecoration Icon={Icon} />
        </HeroSlide>
      );
    }),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <HeroCarousel slides={heroSlides} />

      {categories.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold text-ink">Категории</h2>
          <div className="mt-4 flex flex-wrap gap-4 sm:gap-6">
            {categories.map((category) => {
              const Icon = resolveCategoryIcon(category.name);
              return (
                <Link
                  key={category.id}
                  href={`/catalog/${category.slug}`}
                  className="flex w-20 flex-col items-center gap-2 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-ink transition group-hover:bg-brand/10">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="line-clamp-2 text-xs font-medium text-ink-muted">
                    {category.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {newest.items.length > 0 && (
        <div className="mt-10">
          <ProductCarousel title="Новинки" viewAllHref="/catalog?sort=newest">
            {newest.items.map((product) => (
              <div key={product.id} className={CAROUSEL_ITEM_CLASS}>
                <ProductCard product={product} showFavorite badges={["new"]} />
              </div>
            ))}
          </ProductCarousel>
        </div>
      )}

      {popular.items.length > 0 && (
        <div className="mt-10">
          <ProductCarousel title="Хиты продаж" viewAllHref="/catalog?sort=popular">
            {popular.items.map((product) => (
              <div key={product.id} className={CAROUSEL_ITEM_CLASS}>
                <ProductCard product={product} showFavorite badges={["hit"]} />
              </div>
            ))}
          </ProductCarousel>
        </div>
      )}

      {featuredCategory && featured.items.length > 0 && (
        <div className="mt-10">
          <ProductCarousel
            title={featuredCategory.name}
            viewAllHref={`/catalog/${featuredCategory.slug}`}
          >
            {featured.items.map((product) => (
              <div key={product.id} className={CAROUSEL_ITEM_CLASS}>
                <ProductCard product={product} showFavorite />
              </div>
            ))}
          </ProductCarousel>
        </div>
      )}
    </div>
  );
}
