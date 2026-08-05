import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getProductBySlug } from "@/entities/product/api";
import { listReviews } from "@/entities/reviews/api";
import { RatingRow } from "@/shared/ui/RatingRow";
import { ProductGallery } from "@/widgets/ProductGallery";
import { ProductPurchasePanel } from "@/widgets/ProductPurchasePanel";
import { ProductReviews } from "@/widgets/ProductReviews";
import { ReviewForm } from "@/widgets/ReviewForm";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

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

  const reviewsResponse = await listReviews(slug);

  const prices = product.variants.map((variant) => Number(variant.price));
  const minPrice = prices.length > 0 ? Math.min(...prices) : undefined;
  const attributeEntries = Object.entries(product.attributes);

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
    <div className="mx-auto max-w-[1440px] px-4 py-8">
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

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start">
        <ProductGallery images={product.images} alt={product.name} />

        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{product.name}</h1>
          <div className="mt-2">
            <RatingRow
              ratingAvg={product.rating_avg ?? null}
              ratingCount={product.rating_count}
              size="md"
            />
          </div>
          {product.description && <p className="mt-3 text-ink-muted">{product.description}</p>}

          <div className="mt-6">
            <ProductPurchasePanel
              variants={product.variants}
              productId={product.id}
              productName={product.name}
              productSlug={product.slug}
              imageUrl={product.images[0]?.url ?? null}
            />
          </div>

          {attributeEntries.length > 0 && (
            <div className="mt-8">
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
      </div>

      <div className="mx-auto mt-12 max-w-2xl">
        <h2 className="mb-4 font-display text-lg font-semibold text-ink">
          Отзывы {reviewsResponse.total > 0 && `(${reviewsResponse.total})`}
        </h2>
        <div className="mb-6">
          <ReviewForm slug={slug} />
        </div>
        <ProductReviews reviews={reviewsResponse.items} total={reviewsResponse.total} />
      </div>
    </div>
  );
}
