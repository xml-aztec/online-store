"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { getStatsSummary, listAdminOrders } from "@/entities/orders/adminApi";
import { formatPrice } from "@/shared/lib/formatPrice";
import { formatRelativeTime } from "@/shared/lib/formatRelativeTime";
import { MetricCard } from "@/shared/ui/MetricCard";
import { StatusPill } from "@/shared/ui/StatusPill";

type Period = "7d" | "30d";

// ТЗ plan-razrabotki 4.3+ v2 design also shows a "Сегодня" pill and per-card
// sparklines -- both need daily-granularity stats the backend doesn't expose
// yet (only 7d/30d windows), and a "Требует внимания" panel needing new
// stuck-order/low-stock queries. Deliberately left out of this pass rather
// than faked with client-only approximations that would lie about the real
// (paginated, not fully loaded) data -- see docs/CHANGELOG.md.
const PERIODS: { key: Period; label: string }[] = [
  { key: "7d", label: "7 дней" },
  { key: "30d", label: "30 дней" },
];

// A poll, not a websocket -- there's no push channel in this stack. Re-fetches
// the recent-orders list periodically so the "live" label is honest without
// claiming true real-time delivery.
const FEED_POLL_MS = 20_000;
const RECENTLY_CREATED_MS = 5 * 60_000;

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export default function AdminDashboardPage() {
  const [period, setPeriod] = useState<Period>("7d");

  const { data: stats, isLoading: statsLoading, dataUpdatedAt } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: getStatsSummary,
  });
  const { data: recentOrders, dataUpdatedAt: ordersUpdatedAt } = useQuery({
    queryKey: ["admin-orders-recent"],
    queryFn: () => listAdminOrders({ pageSize: 8 }),
    refetchInterval: FEED_POLL_MS,
  });

  const current = stats ? (period === "7d" ? stats.last_7_days : stats.last_30_days) : null;
  const previous = stats ? (period === "7d" ? stats.prev_7_days : stats.prev_30_days) : null;
  const avgOrderValue =
    current && current.orders_count > 0 ? Number(current.revenue) / current.orders_count : null;
  const prevAvgOrderValue =
    previous && previous.orders_count > 0
      ? Number(previous.revenue) / previous.orders_count
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[22px] font-extrabold text-ink">Дашборд</h1>
        <div className="flex items-center gap-3">
          <span className="flex rounded-lg border border-border bg-bg p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`rounded-md px-3 py-1.5 font-display text-xs font-bold transition ${
                  period === p.key ? "bg-brand text-white" : "text-ink-muted hover:text-ink"
                }`}
              >
                {p.label}
              </button>
            ))}
          </span>
          {dataUpdatedAt > 0 && (
            <span className="font-mono text-[11px] text-ink-muted">
              обновлено{" "}
              {new Date(dataUpdatedAt).toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      {statsLoading && <p className="text-ink-muted">Загрузка статистики…</p>}
      {current && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard
            label="Выручка"
            value={formatPrice(current.revenue)}
            deltaPercent={
              previous ? percentDelta(Number(current.revenue), Number(previous.revenue)) : null
            }
            caption="к прошлому периоду"
          />
          <MetricCard
            label="Заказы"
            value={String(current.orders_count)}
            deltaPercent={
              previous ? percentDelta(current.orders_count, previous.orders_count) : null
            }
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
            caption="к прошлому периоду"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <section className="overflow-hidden rounded-xl border border-border bg-bg">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <span className="flex items-center gap-2">
              <span className="font-display text-sm font-bold text-ink">Последние заказы</span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                live
              </span>
            </span>
            <Link href="/admin/orders" className="text-xs font-semibold text-brand-text hover:underline">
              Все заказы
            </Link>
          </div>
          {!recentOrders && <p className="p-4 text-sm text-ink-muted">Загрузка…</p>}
          {recentOrders?.items.map((order) => {
            // ordersUpdatedAt (React Query's fetch timestamp), not Date.now()
            // called inline during render -- keeps this pure/deterministic
            // for a given query state, and re-evaluates on every poll anyway.
            const isRecent =
              ordersUpdatedAt - new Date(order.created_at).getTime() < RECENTLY_CREATED_MS;
            return (
              <Link
                key={order.id}
                href={`/admin/orders?order=${order.id}`}
                className="grid grid-cols-[auto_1fr_100px_auto_60px] items-center gap-2 border-b border-surface px-4 py-2.5 text-[13px] last:border-0 hover:bg-surface"
              >
                <span className="flex items-center gap-1.5">
                  {isRecent && (
                    <span
                      className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-sale"
                      aria-hidden="true"
                    />
                  )}
                  <span className="whitespace-nowrap font-mono font-semibold text-ink">
                    {order.number}
                  </span>
                </span>
                <span className="truncate text-ink">{order.full_name}</span>
                <span className="text-right font-mono font-semibold text-ink">
                  {formatPrice(order.total)}
                </span>
                <span className="pl-3">
                  <StatusPill status={order.status} />
                </span>
                <span className="text-right font-mono text-xs text-ink-muted">
                  {formatRelativeTime(order.created_at)}
                </span>
              </Link>
            );
          })}
        </section>

        {stats && stats.top_products.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-border bg-bg">
            <div className="border-b border-border px-4 py-3">
              <span className="font-display text-sm font-bold text-ink">Топ-5 товаров · 30 дней</span>
            </div>
            {stats.top_products.map((product, index) => {
              const maxSold = stats.top_products[0]?.quantity_sold || 1;
              const barPercent = Math.round((product.quantity_sold / maxSold) * 100);
              return (
                <div
                  key={product.product_name}
                  className="flex flex-col gap-1.5 border-b border-surface px-4 py-2.5 last:border-0"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 font-mono text-xs font-bold text-ink-muted">
                      {index + 1}
                    </span>
                    <span className="flex-1 truncate text-[13px] text-ink">
                      {product.product_name}
                    </span>
                    <span className="whitespace-nowrap font-mono text-xs font-semibold text-ink">
                      {product.quantity_sold} шт
                    </span>
                  </div>
                  <div className="ml-6 h-1 rounded-full bg-surface">
                    <div
                      className="h-1 rounded-full bg-brand"
                      style={{ width: `${barPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
