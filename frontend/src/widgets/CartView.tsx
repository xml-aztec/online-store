"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useApplyPromoMutation, useCartQuery, useClearCartMutation } from "@/entities/cart/queries";
import { formatPrice } from "@/shared/lib/formatPrice";
import { CartItemRow } from "@/widgets/CartItemRow";

function CartSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]" aria-busy="true" aria-label="Загрузка корзины">
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-4 border-b border-ink/10 py-4 last:border-0">
            <div className="h-20 w-20 shrink-0 animate-pulse rounded-lg bg-surface" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-surface" />
              <div className="h-4 w-1/4 animate-pulse rounded bg-surface" />
              <div className="h-8 w-24 animate-pulse rounded-lg bg-surface" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-surface" />
    </div>
  );
}

export function CartView() {
  const { data: cart, isLoading } = useCartQuery();
  const clearCart = useClearCartMutation();
  const applyPromo = useApplyPromoMutation();
  const [promoCode, setPromoCode] = useState("");

  if (isLoading) {
    return <CartSkeleton />;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-surface">
          <ShoppingCart className="h-10 w-10 text-ink-muted" aria-hidden="true" />
        </span>
        <div>
          <p className="font-display text-lg font-bold text-ink">Корзина пуста</p>
          <p className="mt-1 max-w-xs text-sm text-ink-muted">
            Добавьте товары из каталога — доставим по Бишкеку за 1 день.
          </p>
        </div>
        <Link
          href="/catalog"
          className="mt-2 inline-block rounded-lg bg-brand px-6 py-3 text-sm font-medium text-white hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          В каталог
        </Link>
      </div>
    );
  }

  const hasUnavailableItems = cart.items.some(
    (item) => !item.is_available || item.qty > item.available_qty
  );

  return (
    <div className="grid grid-cols-1 gap-8 pb-24 lg:grid-cols-[1fr_320px] lg:pb-0">
      <div>
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => clearCart.mutate()}
            className="text-sm text-ink-muted underline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Очистить корзину
          </button>
        </div>

        {cart.items.map((item) => (
          <CartItemRow key={item.variant_id} item={item} />
        ))}
      </div>

      <aside className="h-fit rounded-xl border border-ink/10 p-4 lg:sticky lg:top-24">
        {hasUnavailableItems && (
          <p className="mb-3 rounded-lg bg-accent-sale/10 p-3 text-sm text-accent-sale-700">
            Некоторые товары изменились в наличии — проверьте количество перед оформлением.
          </p>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (promoCode.trim()) applyPromo.mutate(promoCode.trim());
          }}
          className="mb-4 flex gap-2"
        >
          <label htmlFor="promo-code" className="sr-only">
            Промокод
          </label>
          <input
            id="promo-code"
            type="text"
            value={promoCode}
            onChange={(event) => setPromoCode(event.target.value)}
            placeholder="Промокод"
            className="w-full rounded-lg border border-ink/15 bg-bg px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="submit"
            disabled={applyPromo.isPending}
            className="shrink-0 rounded-lg border border-ink/15 px-3 py-2 text-sm font-medium text-ink hover:border-brand/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Применить
          </button>
        </form>
        {applyPromo.isError && (
          <p className="mb-3 text-sm text-accent-sale-700">{applyPromo.error.message}</p>
        )}
        {cart.promo_code && (
          <p className="mb-3 text-sm text-success-700">Промокод «{cart.promo_code}» применён</p>
        )}

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Товары</dt>
            <dd className="font-mono text-ink">{formatPrice(cart.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Доставка</dt>
            <dd className="text-xs text-ink-muted">Рассчитывается при оформлении</dd>
          </div>
          {Number(cart.discount_amount) > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-muted">Скидка</dt>
              <dd className="font-mono text-success-700">−{formatPrice(cart.discount_amount)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-ink/10 pt-2 text-base font-semibold text-ink">
            <dt>Итого</dt>
            <dd className="font-mono text-lg">{formatPrice(cart.total)}</dd>
          </div>
        </dl>

        <Link
          href="/checkout"
          className="mt-4 block w-full rounded-lg bg-brand px-4 py-3 text-center text-sm font-medium text-white hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Оформить заказ
        </Link>
      </aside>

      <div
        className="fixed inset-x-0 z-20 flex items-center gap-3 border-t border-ink/10 bg-bg px-4 py-3 shadow-[0_-4px_16px_rgba(20,22,26,0.06)] lg:hidden"
        style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-muted">Итого</p>
          <p className="truncate font-mono text-lg font-bold text-ink">{formatPrice(cart.total)}</p>
        </div>
        <Link
          href="/checkout"
          className="shrink-0 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Оформить заказ
        </Link>
      </div>
    </div>
  );
}
