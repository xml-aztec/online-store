import { Package, RotateCcw, Truck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { getBanners, type Banner } from "@/entities/banner/api";
import { getCategoryTree, type CategoryNode } from "@/entities/category/api";
import { getCheckoutConfig, type CheckoutConfig } from "@/entities/orders/api";
import { listProducts, type ListProductsParams, type ProductListResponse } from "@/entities/product/api";
import { formatPrice } from "@/shared/lib/formatPrice";
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
const DEALS_ITEM_CLASS = "w-[156px] shrink-0 sm:w-[220px]";

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

async function safeBannerList(): Promise<Banner[]> {
  try {
    return await getBanners();
  } catch {
    return [];
  }
}

async function safeCheckoutConfig(): Promise<CheckoutConfig | null> {
  try {
    return await getCheckoutConfig();
  } catch {
    return null;
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
      className="mx-auto hidden h-32 w-32 text-white/20 sm:block sm:h-48 sm:w-48"
    />
  );
}

// Admin-managed hero banners (see /admin/banners) -- a real photo with
// optional headline/subhead/CTA overlaid on a gradient for legibility, and
// the whole slide is a link when the admin sets one.
function PhotoHeroSlide({
  banner,
  priority,
  headingTag: HeadingTag,
}: {
  banner: Banner;
  priority: boolean;
  headingTag: "h1" | "h2";
}) {
  const hasCopy = Boolean(banner.title || banner.subtitle || banner.button_text);

  const slide = (
    <div className="relative min-h-64 overflow-hidden bg-surface sm:min-h-80">
      <Image
        src={banner.image_url}
        alt={banner.title ?? ""}
        fill
        unoptimized
        priority={priority}
        sizes="(min-width: 1024px) 1152px, 100vw"
        className="object-cover"
      />
      {hasCopy && (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
          />
          <div className="absolute inset-0 flex flex-col items-start justify-end gap-3 px-6 py-8 sm:px-10 sm:py-12">
            {banner.subtitle && (
              <p className="text-sm font-medium uppercase tracking-wide text-white/85">
                {banner.subtitle}
              </p>
            )}
            {banner.title && (
              <HeadingTag className="max-w-xl font-display text-2xl font-extrabold tracking-tight text-white sm:text-4xl">
                {banner.title}
              </HeadingTag>
            )}
            {banner.button_text && (
              <span className="rounded-lg bg-white px-6 py-3 text-sm font-bold text-brand-text">
                {banner.button_text}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );

  if (!banner.link_url) return slide;
  return <Link href={banner.link_url}>{slide}</Link>;
}

function CategoryTile({ category, Icon }: { category: CategoryNode; Icon: typeof Package }) {
  return (
    <Link
      href={`/catalog/${category.slug}`}
      className="grid grid-cols-2 overflow-hidden rounded-xl border border-[#FFD9BF] bg-brand-soft transition hover:shadow-lg"
    >
      <div className="flex min-h-[180px] flex-col gap-2.5 p-5">
        <span className="font-display text-xl font-extrabold tracking-tight text-ink">
          {category.name}
        </span>
        <span className="mt-auto text-xs text-ink-muted">
          <span className="font-mono font-bold text-ink">{category.product_count}</span> товаров
        </span>
        <span className="font-display text-sm font-extrabold text-brand-text">Смотреть →</span>
      </div>
      <div className="relative overflow-hidden bg-[#FFE8D6]">
        {category.image_url ? (
          <Image
            src={category.image_url}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 640px) 320px, 50vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon className="h-12 w-12 text-brand-text/40" aria-hidden="true" />
          </div>
        )}
      </div>
    </Link>
  );
}

export default async function HomePage() {
  const [categories, banners, checkoutConfig] = await Promise.all([
    safeCategoryTree(),
    safeBannerList(),
    safeCheckoutConfig(),
  ]);

  const [deals, discounted, popular] = await Promise.all([
    safeProductList({ on_sale: true, sort: "popular", page_size: 8 }),
    safeProductList({ on_sale: true, sort: "newest", page_size: 10 }),
    safeProductList({ sort: "popular", page_size: 10 }),
  ]);

  // Real, admin-managed banners (/admin/banners) take over the hero once any
  // exist; a fresh store with none yet falls back to the built-in intro +
  // first-two-categories slides so the homepage is never empty.
  const heroSlides =
    banners.length > 0
      ? banners.map((banner, index) => (
          <PhotoHeroSlide
            key={banner.id}
            banner={banner}
            priority={index === 0}
            headingTag={index === 0 ? "h1" : "h2"}
          />
        ))
      : [
          <HeroSlide key="intro">
            <div className="flex flex-col items-start gap-4">
              <span className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-bold text-white">
                Доставка по Бишкеку за 1 день
              </span>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-4xl">
                Товары для дома HobbyLife
              </h1>
              <p className="max-w-xl text-white/80">
                Посуда и пищевые контейнеры, товары для кухни и хранения с доставкой по Бишкеку.
              </p>
              <Link
                href="/catalog"
                className="rounded-lg bg-white px-6 py-3 text-sm font-bold text-brand-text hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
                  <p className="text-sm font-medium uppercase tracking-wide text-white/70">
                    Категория
                  </p>
                  <h2 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-4xl">
                    {category.name}
                  </h2>
                  <Link
                    href={`/catalog/${category.slug}`}
                    className="rounded-lg bg-white px-6 py-3 text-sm font-bold text-brand-text hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    Смотреть товары
                  </Link>
                </div>
                <HeroDecoration Icon={Icon} />
              </HeroSlide>
            );
          }),
        ];

  const trustFacts = [
    {
      Icon: Truck,
      color: "text-success",
      title: checkoutConfig
        ? `Бесплатная доставка от ${formatPrice(checkoutConfig.free_delivery_threshold)}`
        : "Бесплатная доставка от порога заказа",
      note: "По Бишкеку — курьером или самовывозом",
    },
    {
      Icon: Wallet,
      color: "text-brand-text",
      title: "Оплата при получении",
      note: "Наличными или картой курьеру — сначала проверьте товар",
    },
    {
      Icon: Package,
      color: "text-brand-text",
      title: "Остаток виден сразу",
      note: "На карточке товара — точное наличие, без сюрпризов при заказе",
    },
    {
      Icon: RotateCcw,
      color: "text-success",
      title: "Возврат и обмен",
      note: "Если товар не подошёл — свяжитесь с нами после доставки",
    },
  ];

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:py-8">
      <HeroCarousel slides={heroSlides} />

      {deals.items.length > 0 && (
        <section className="mt-8 rounded-xl border border-[#FFD9BF] bg-brand-soft p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <h2 className="font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
              Товары дня
            </h2>
            <Link
              href="/catalog?on_sale=true"
              className="ml-auto font-display text-sm font-extrabold text-brand-text"
            >
              Все акции →
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {deals.items.map((product) => (
              <div key={product.id} className={DEALS_ITEM_CLASS}>
                <ProductCard product={product} showFavorite />
              </div>
            ))}
          </div>
        </section>
      )}

      {categories.length > 0 && (
        <section className="mt-8">
          <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-8">
            {categories.map((category) => {
              const Icon = resolveCategoryIcon(category.name);
              return (
                <Link
                  key={category.id}
                  href={`/catalog/${category.slug}`}
                  className="flex flex-col items-center gap-2 rounded-xl border border-ink/10 bg-bg px-2 py-3.5 text-center transition hover:border-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand-text">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="line-clamp-2 text-[11px] font-semibold text-ink">
                    {category.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {discounted.items.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-baseline gap-3">
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              Скидки
            </h2>
            <span className="text-sm text-ink-muted">
              <span className="font-mono font-bold text-ink">{discounted.total}</span> товаров по
              акции
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {discounted.items.map((product) => (
              <ProductCard key={product.id} product={product} showFavorite />
            ))}
          </div>
          <div className="mt-5 flex justify-center">
            <Link
              href="/catalog?on_sale=true"
              className="rounded-lg border-2 border-brand px-8 py-3 font-display text-sm font-extrabold text-brand-text hover:bg-brand-soft"
            >
              Показать ещё
            </Link>
          </div>
        </section>
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

      {categories.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Категории
          </h2>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {categories.slice(0, 4).map((category) => (
              <CategoryTile
                key={category.id}
                category={category}
                Icon={resolveCategoryIcon(category.name)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 grid grid-cols-1 gap-4 rounded-xl border border-[#FFD9BF] bg-brand-soft p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
        {trustFacts.map(({ Icon, color, title, note }) => (
          <div key={title} className="flex items-start gap-3">
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-bg">
              <Icon className={`h-5 w-5 ${color}`} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div>
              <p className="font-display text-sm font-extrabold text-ink">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{note}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
