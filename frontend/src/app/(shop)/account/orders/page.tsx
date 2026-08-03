"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { listMyOrders } from "@/entities/orders/api";
import { formatPrice } from "@/shared/lib/formatPrice";
import { StatusPill } from "@/shared/ui/StatusPill";

export default function AccountOrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => listMyOrders(1, 50),
  });

  return (
    <div>
      <h2 className="mb-4 font-display text-lg font-extrabold text-ink">Мои заказы</h2>
      {isLoading && <p className="text-ink-muted">Загрузка…</p>}
      {data && data.items.length === 0 && <p className="text-ink-muted">Заказов пока нет</p>}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-surface text-left text-ink-muted">
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
                  className="border-b border-ink/10 last:border-0"
                >
                  <td className="px-3 py-2 font-mono font-medium text-ink">
                    {order.number}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={order.status} />
                  </td>
                  <td className="px-3 py-2 font-mono">{formatPrice(order.total)}</td>
                  <td className="px-3 py-2 text-ink-muted">
                    {new Date(order.created_at).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/account/orders/${order.number}`}
                      className="text-ink-muted underline hover:text-ink"
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
