"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { listMyOrders, ORDER_STATUS_LABELS } from "@/entities/orders/api";
import { formatPrice } from "@/shared/lib/formatPrice";

export default function AccountOrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => listMyOrders(1, 50),
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Мои заказы</h1>
      {isLoading && <p className="text-zinc-500">Загрузка…</p>}
      {data && data.items.length === 0 && <p className="text-zinc-500">Заказов пока нет</p>}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-3 py-2">Номер</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Сумма</th>
                <th className="px-3 py-2">Дата</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((order) => (
                <tr
                  key={order.number}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {order.number}
                  </td>
                  <td className="px-3 py-2">
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </td>
                  <td className="px-3 py-2">{formatPrice(order.total)}</td>
                  <td className="px-3 py-2 text-zinc-500">
                    {new Date(order.created_at).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/account/orders/${order.number}`}
                      className="text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      Подробнее
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
