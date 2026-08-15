import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCheckoutConfig } from "@/entities/orders/api";
import { getProductBySlug, listProducts } from "@/entities/product/api";
import { ProductCard } from "@/widgets/ProductCard";
import { ProductGallery } from "@/widgets/ProductGallery";
import { ProductPurchasePanel } from "@/widgets/ProductPurchasePanel";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

// Mirrors the homepage rails' CAROUSEL_ITEM_CLASS pattern (mobile: horizontal
// scroll, snap-start cards) but switches to a static 5-up grid at lg, since
// the design shows a plain grid on desktop -- not a scrollable rail.
const RECS_ITEM_CLASS = "w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-auto lg:shrink lg:snap-none";

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Товар не найден" };

  const description = product.description ?? `Купить ${product.name} в HobbyLife`;
  const imageUrl = product.images[0]?.url;

  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      type: "website",
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [checkoutConfig, recsResponse] = await Promise.all([
    getCheckoutConfig(),
    listProducts({ category: product.category.slug, page_size: 8 }),
  ]);

  // "С этим покупают" -- honest stand-in for the design's static mock data:
  // other products in the same category, capped at 5, current product
  // excluded.
  const recommendations = recsResponse.items.filter((item) => item.id !== product.id).slice(0, 5);

  const prices = product.variants.map((variant) => Number(variant.price));
  const minPrice = prices.length > 0 ? Math.min(...prices) : undefined;
  const attributeEntries = Object.entries(product.attributes);

  // Static (not tied to the currently-selected variant -- gallery and
  // purchase panel don't share selection state): does ANY variant currently
  // carry a discount, and by how much at most.
  const discountPercents = product.variants
    .filter((v) => v.compare_at_price && Number(v.compare_at_price) > Number(v.price))
    .map((v) => Math.round((1 - Number(v.price) / Number(v.compare_at_price)) * 100));
  const discountBadge = discountPercents.length > 0 ? { percent: Math.max(...discountPercents) } : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    category: product.category.name,
    image: product.images.map((image) => image.url),
    offers:
      minPrice !== undefined
        ? {
            "@type": "AggregateOffer",
            priceCurrency: "KGS",
            lowPrice: minPrice,
            highPrice: Math.max(...prices),
            availability: product.variants.some((variant) => variant.is_available)
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          }
        : undefined,
  };

  return (
    // Bottom padding clears two stacked fixed mobile bars below the fold:
    // BottomNav (site-wide tab bar) + ProductPurchasePanel's sticky CTA.
    <div className="mx-auto max-w-[1440px] px-4 py-8 pb-40 lg:pb-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Хлебные крошки" className="mb-6 text-sm text-ink-muted">
        <Link
          href="/catalog"
          className="hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Каталог
        </Link>
        <span aria-hidden="true"> / </span>
        <Link
          href={`/catalog/${product.category.slug}`}
          className="hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {product.category.name}
        </Link>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_420px] lg:items-start">
        <ProductGallery images={product.images} alt={product.name} discountBadge={discountBadge} />

        <ProductPurchasePanel
          variants={product.variants}
          productId={product.id}
          productName={product.name}
          productSlug={product.slug}
          imageUrl={product.images[0]?.url ?? null}
          courierCost={checkoutConfig.courier_delivery_cost}
        />
      </div>

      {(product.description || attributeEntries.length > 0) && (
        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_420px]">
          {product.description && (
            <div>
              <h2 className="mb-3 font-display text-lg font-semibold text-ink">Описание</h2>
              <p className="max-w-xl text-sm leading-relaxed text-ink-muted">
                {product.description}
              </p>
            </div>
          )}
          {attributeEntries.length > 0 && (
            <div>
              <h2 className="mb-3 font-display text-lg font-semibold text-ink">Характеристики</h2>
              <table className="w-full overflow-hidden rounded-xl text-sm">
                <tbody>
                  {attributeEntries.map(([key, value], index) => (
                    <tr key={key} className={index % 2 === 1 ? "bg-surface" : undefined}>
                      <td className="py-2 pl-3 pr-4 text-ink-muted">{key}</td>
                      <td className="py-2 pr-3 text-ink">{String(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">С этим покупают</h2>
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4 lg:grid lg:grid-cols-5 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            {recommendations.map((item) => (
              <div key={item.id} className={RECS_ITEM_CLASS}>
                <ProductCard product={item} showFavorite />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
