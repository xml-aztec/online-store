"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { ProductDetailContent } from "@/widgets/ProductDetailContent";

/** Standalone deep link -- same ProductDetailContent the products-list
 * drawer renders (?product=<id>), just with its own card chrome. */
export default function AdminProductDetailPage() {
  const params = useParams<{ id: string }>();

  return (
    <div className="w-full max-w-[640px] rounded-2xl border border-border bg-surface">
      <ProductDetailContent
        productId={params.id}
        headerExtra={
          <p className="text-xs text-ink-muted">
            <Link href="/admin/products" className="hover:text-ink hover:underline">
              Товары
            </Link>{" "}
            / редактирование
          </p>
        }
      />
    </div>
  );
}
