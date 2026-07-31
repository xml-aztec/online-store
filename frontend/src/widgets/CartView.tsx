"use client";

import Link from "next/link";
import { useState } from "react";

import { useApplyPromoMutation, useCartQuery, useClearCartMutation } from "@/entities/cart/queries";
import { formatPrice } from "@/shared/lib/formatPrice";
import { CartItemRow } from "@/widgets/CartItemRow";

export function CartView() {
  const { data: cart, isLoading } = useCartQuery();
  const clearCart = useClearCartMutation();
  const applyPromo = useApplyPromoMutation();
  const [promoCode, setPromoCode] = useState("");

  if (isLoading) {
    return <p className="py-12 text-center text-zinc-500">Загрузка корзины…</p>;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-500">Ваша корзина пуста</p>
        <Link
          href="/catalog"
          className="mt-4 inline-block rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Перейти в каталог
        </Link>
      </div>
    );
  }

  const hasUnavailableItems = cart.items.some(
    (item) => !item.is_available || item.qty > item.available_qty
  );

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => clearCart.mutate()}
            className="text-sm text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Очистить корзину
          </button>
        </div>

        {cart.items.map((item) => (
          <CartItemRow key={item.variant_id} item={item} />
        ))}
      </div>

      <aside className="h-fit rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        {hasUnavailableItems && (
          <p className="mb-3 rounded bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
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
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={applyPromo.isPending}
            className="shrink-0 rounded border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Применить
          </button>
        </form>
        {applyPromo.isError && (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400">{applyPromo.error.message}</p>
        )}
        {cart.promo_code && (
          <p className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">
            Промокод «{cart.promo_code}» применён
          </p>
        )}

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Товары</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">{formatPrice(cart.subtotal)}</dd>
          </div>
          {Number(cart.discount_amount) > 0 && (
            <div className="flex justify-between">
              <dt className="text-zinc-500">Скидка</dt>
              <dd className="text-emerald-600 dark:text-emerald-400">
                −{formatPrice(cart.discount_amount)}
              </dd>
            </div>
          )}
          <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
            <dt>Итого</dt>
            <dd>{formatPrice(cart.total)}</dd>
          </div>
        </dl>

        <Link
          href="/checkout"
          className="mt-4 block w-full rounded bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Оформить заказ
        </Link>
      </aside>
    </div>
  );
}
