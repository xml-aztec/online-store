"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ORDER_STATUS_LABELS } from "@/entities/orders/api";
import { getStatsSummary, listAdminOrders } from "@/entities/orders/adminApi";
import { formatPrice } from "@/shared/lib/formatPrice";

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
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Дашборд</h1>

      {statsLoading && <p className="text-zinc-500">Загрузка статистики…</p>}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm text-zinc-500">Выручка за 7 дней</p>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {formatPrice(stats.last_7_days.revenue)}
            </p>
            <p className="text-sm text-zinc-500">{stats.last_7_days.orders_count} заказов</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm text-zinc-500">Выручка за 30 дней</p>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {formatPrice(stats.last_30_days.revenue)}
            </p>
            <p className="text-sm text-zinc-500">{stats.last_30_days.orders_count} заказов</p>
          </div>
        </div>
      )}

      {stats && stats.top_products.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase text-zinc-500">
            Топ-5 товаров (30 дней)
          </h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                  <th className="px-3 py-2">Товар</th>
                  <th className="px-3 py-2">Продано, шт.</th>
                  <th className="px-3 py-2">Выручка</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_products.map((product) => (
                  <tr
                    key={product.product_name}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                  >
                    <td className="px-3 py-2">{product.product_name}</td>
                    <td className="px-3 py-2">{product.quantity_sold}</td>
                    <td className="px-3 py-2">{formatPrice(product.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-zinc-500">Последние заказы</h2>
          <Link
            href="/admin/orders"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Все заказы →
          </Link>
        </div>
        {ordersLoading && <p className="text-zinc-500">Загрузка…</p>}
        {recentOrders && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
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
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {order.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{ORDER_STATUS_LABELS[order.status] ?? order.status}</td>
                    <td className="px-3 py-2">{order.email}</td>
                    <td className="px-3 py-2">{formatPrice(order.total)}</td>
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
