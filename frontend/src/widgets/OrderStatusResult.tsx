"use client";

import Link from "next/link";

import { ORDER_STATUS_LABELS } from "@/entities/orders/api";
import { useOrderStatusQuery } from "@/entities/orders/queries";
import { formatPrice } from "@/shared/lib/formatPrice";

interface OrderStatusResultProps {
  number: string;
  email: string | undefined;
  heading: string;
  description: string;
}

export function OrderStatusResult({ number, email, heading, description }: OrderStatusResultProps) {
  const { data: order, isLoading, isError } = useOrderStatusQuery(number, email);

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-bold text-ink">{heading}</h1>
      <p className="mt-2 text-ink-muted">{description}</p>
      <p className="mt-1 font-mono text-sm text-ink-muted">Номер заказа: {number}</p>

      {!email && (
        <p className="mt-4 text-sm text-accent-sale-700">
          Не удалось определить статус заказа автоматически.
        </p>
      )}
      {email && isLoading && <p className="mt-6 text-ink-muted">Проверяем статус…</p>}
      {email && isError && (
        <p className="mt-6 text-accent-sale-700">Не удалось загрузить статус заказа.</p>
      )}
      {order && (
        <div className="mt-6 rounded-xl border border-ink/10 p-4 text-left">
          <p className="text-sm text-ink-muted">Статус</p>
          <p className="text-lg font-medium text-ink">
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </p>
          <p className="mt-4 text-sm text-ink-muted">Сумма</p>
          <p className="font-mono text-lg font-medium text-ink">{formatPrice(order.total)}</p>
        </div>
      )}

      <Link
        href="/catalog"
        className="mt-8 inline-block rounded-lg bg-brand px-6 py-3 text-sm font-medium text-white hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Продолжить покупки
      </Link>
    </div>
  );
}
