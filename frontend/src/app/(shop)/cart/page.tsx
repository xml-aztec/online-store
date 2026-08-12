"use client";

import { cartItemCount, useCartQuery } from "@/entities/cart/queries";
import { pluralizeRu } from "@/shared/lib/pluralizeRu";
import { CartView } from "@/widgets/CartView";

export default function CartPage() {
  // Same query key as CartView -- React Query dedupes this into a single
  // request, this just reads the cached item count for the heading.
  const { data: cart } = useCartQuery();
  const itemCount = cartItemCount(cart);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8">
      <h1 className="mb-6 font-display text-xl font-bold text-ink sm:text-2xl">
        Корзина{" "}
        {cart && cart.items.length > 0 && (
          <span className="font-mono text-base font-semibold text-ink-muted sm:text-xl">
            {itemCount} {pluralizeRu(itemCount, ["товар", "товара", "товаров"])}
          </span>
        )}
      </h1>
      <CartView />
    </div>
  );
}
