"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ORDER_STATUS_LABELS } from "@/entities/orders/api";
import { getStatsSummary, listAdminOrders } from "@/entities/orders/adminApi";
import { formatPrice } from "@/shared/lib/formatPrice";
import { orderStatusPillClass } from "@/shared/lib/orderStatusStyles";

export default function AdminDashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: getStatsSummary,
  });
  const { data: recentOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["admin-orders-recent"],
    queryFn: () => listAdminOrders({ pageSize: 10 }),
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-ink">Дашборд</h1>

      {statsLoading && <p className="text-ink-muted">Загрузка статистики…</p>}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-ink/10 p-4">
            <p className="text-sm text-ink-muted">Выручка за 7 дней</p>
            <p className="font-mono text-2xl font-semibold text-ink">
              {formatPrice(stats.last_7_days.revenue)}
            </p>
            <p className="text-sm text-ink-muted">{stats.last_7_days.orders_count} заказов</p>
          </div>
          <div className="rounded-lg border border-ink/10 p-4">
            <p className="text-sm text-ink-muted">Выручка за 30 дней</p>
            <p className="font-mono text-2xl font-semibold text-ink">
              {formatPrice(stats.last_30_days.revenue)}
            </p>
            <p className="text-sm text-ink-muted">{stats.last_30_days.orders_count} заказов</p>
          </div>
        </div>
      )}

      {stats && stats.top_products.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase text-ink-muted">
            Топ-5 товаров (30 дней)
          </h2>
          <div className="overflow-x-auto rounded-lg border border-ink/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-surface text-left text-ink-muted">
                  <th className="px-3 py-2">Товар</th>
                  <th className="px-3 py-2">Продано, шт.</th>
                  <th className="px-3 py-2">Выручка</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_products.map((product) => (
                  <tr
                    key={product.product_name}
                    className="border-b border-ink/10 last:border-0"
                  >
                    <td className="px-3 py-2">{product.product_name}</td>
                    <td className="px-3 py-2 font-mono">{product.quantity_sold}</td>
                    <td className="px-3 py-2 font-mono">{formatPrice(product.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-ink-muted">Последние заказы</h2>
          <Link
            href="/admin/orders"
            className="text-sm text-ink-muted hover:text-ink"
          >
            Все заказы →
          </Link>
        </div>
        {ordersLoading && <p className="text-ink-muted">Загрузка…</p>}
        {recentOrders && (
          <div className="overflow-x-auto rounded-lg border border-ink/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-surface text-left text-ink-muted">
                  <th className="px-3 py-2">Номер</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2">Клиент</th>
                  <th className="px-3 py-2">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.items.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-ink/10 last:border-0 hover:bg-surface"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-mono font-medium text-ink hover:underline"
                      >
                        {order.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${orderStatusPillClass(order.status)}`}
                      >
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{order.email}</td>
                    <td className="px-3 py-2 font-mono">{formatPrice(order.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
