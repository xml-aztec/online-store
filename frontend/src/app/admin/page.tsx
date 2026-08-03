"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { getStatsSummary, listAdminOrders } from "@/entities/orders/adminApi";
import { formatPrice } from "@/shared/lib/formatPrice";
import { MetricCard } from "@/shared/ui/MetricCard";
import { StatusPill } from "@/shared/ui/StatusPill";

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export default function AdminDashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: getStatsSummary,
  });
  const { data: recentOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["admin-orders-recent"],
    queryFn: () => listAdminOrders({ pageSize: 10 }),
  });

  const avgOrderValue =
    stats && stats.last_30_days.orders_count > 0
      ? Number(stats.last_30_days.revenue) / stats.last_30_days.orders_count
      : null;
  const prevAvgOrderValue =
    stats && stats.prev_30_days.orders_count > 0
      ? Number(stats.prev_30_days.revenue) / stats.prev_30_days.orders_count
      : null;

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-ink">Дашборд</h1>

      {statsLoading && <p className="text-ink-muted">Загрузка статистики…</p>}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Выручка · 7 дней"
            value={formatPrice(stats.last_7_days.revenue)}
            deltaPercent={percentDelta(
              Number(stats.last_7_days.revenue),
              Number(stats.prev_7_days.revenue)
            )}
            caption="к прошлому периоду"
          />
          <MetricCard
            label="Выручка · 30 дней"
            value={formatPrice(stats.last_30_days.revenue)}
            deltaPercent={percentDelta(
              Number(stats.last_30_days.revenue),
              Number(stats.prev_30_days.revenue)
            )}
            caption="к прошлому периоду"
          />
          <MetricCard
            label="Заказы · 7 дней"
            value={String(stats.last_7_days.orders_count)}
            deltaPercent={percentDelta(
              stats.last_7_days.orders_count,
              stats.prev_7_days.orders_count
            )}
            caption="к прошлому периоду"
          />
          <MetricCard
            label="Средний чек"
            value={avgOrderValue != null ? formatPrice(avgOrderValue) : "—"}
            deltaPercent={
              avgOrderValue != null && prevAvgOrderValue != null
                ? percentDelta(avgOrderValue, prevAvgOrderValue)
                : null
            }
            caption="за 30 дней"
          />
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
                      <StatusPill status={order.status} />
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
