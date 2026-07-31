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
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{heading}</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">{description}</p>
      <p className="mt-1 text-sm text-zinc-500">Номер заказа: {number}</p>

      {!email && (
        <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">
          Не удалось определить статус заказа автоматически.
        </p>
      )}
      {email && isLoading && <p className="mt-6 text-zinc-500">Проверяем статус…</p>}
      {email && isError && (
        <p className="mt-6 text-red-600 dark:text-red-400">Не удалось загрузить статус заказа.</p>
      )}
      {order && (
        <div className="mt-6 rounded-lg border border-zinc-200 p-4 text-left dark:border-zinc-800">
          <p className="text-sm text-zinc-500">Статус</p>
          <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </p>
          <p className="mt-4 text-sm text-zinc-500">Сумма</p>
          <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            {formatPrice(order.total)}
          </p>
        </div>
      )}

      <Link
        href="/catalog"
        className="mt-8 inline-block rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Продолжить покупки
      </Link>
    </div>
  );
}
