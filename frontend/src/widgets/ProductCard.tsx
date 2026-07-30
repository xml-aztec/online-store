import Image from "next/image";
import Link from "next/link";

import type { ProductListItem } from "@/entities/product/api";
import { formatPrice } from "@/shared/lib/formatPrice";

export function ProductCard({ product }: { product: ProductListItem }) {
  const priceLabel =
    product.price_from === product.price_to
      ? formatPrice(product.price_from)
      : `от ${formatPrice(product.price_from)}`;

  return (
    <Link
      href={`/product/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {product.image_url ? (
          // unoptimized: Next's optimizer fetches server-side, which can't reach the
          // presigned URL's public host from inside the frontend container; the
          // backend already serves pre-resized webp, so we don't need it anyway.
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            unoptimized
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            Нет фото
          </div>
        )}
        {!product.is_available && (
          <span className="absolute left-2 top-2 rounded-full bg-zinc-900/80 px-2 py-1 text-xs font-medium text-white">
            Нет в наличии
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {product.name}
        </h3>
        <p className="mt-auto text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {priceLabel}
        </p>
      </div>
    </Link>
  );
}
