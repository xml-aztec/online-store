"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { getOrderStatusCounts, listAdminOrders } from "@/entities/orders/adminApi";
import { formatPrice } from "@/shared/lib/formatPrice";
import { StatusPill } from "@/shared/ui/StatusPill";

// Maps the mockup's 6 tabs onto the 8 real order statuses -- some tabs
// intentionally bucket more than one status (e.g. "В сборке" covers both
// processing and shipped).
const STATUS_BUCKETS: { key: string; label: string; statuses: string[] }[] = [
  { key: "all", label: "Все", statuses: [] },
  { key: "new", label: "Новые", statuses: ["pending", "awaiting_payment"] },
  { key: "paid", label: "Оплачены", statuses: ["paid"] },
  { key: "packing", label: "В сборке", statuses: ["processing", "shipped"] },
  { key: "delivered", label: "Доставлены", statuses: ["delivered"] },
  { key: "cancelled", label: "Отменены", statuses: ["cancelled", "refunded"] },
];

function bucketCount(counts: Record<string, number> | undefined, statuses: string[]): number {
  if (!counts) return 0;
  if (statuses.length === 0) return Object.values(counts).reduce((sum, n) => sum + n, 0);
  return statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}

function OrdersTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bucketKey = searchParams.get("bucket") ?? "all";
  const search = searchParams.get("search") ?? "";
  const page = Number(searchParams.get("page") ?? "1");
  const bucket = STATUS_BUCKETS.find((b) => b.key === bucketKey) ?? STATUS_BUCKETS[0];

  const { data: statusCounts } = useQuery({
    queryKey: ["admin-order-status-counts"],
    queryFn: getOrderStatusCounts,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", bucketKey, search, page],
    queryFn: () =>
      listAdminOrders({
        status: bucket.statuses.length > 0 ? bucket.statuses : undefined,
        search: search || undefined,
        page,
        pageSize: 20,
      }),
  });

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/admin/orders?${params.toString()}`);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_BUCKETS.map((b) => {
          const active = b.key === bucketKey;
          const count = bucketCount(statusCounts?.counts, b.statuses);
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => updateParam("bucket", b.key === "all" ? "" : b.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-brand text-white"
                  : "border border-ink/15 text-ink hover:border-brand/40"
              }`}
            >
              {b.label} <span className="font-mono">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-4">
        <input
          type="search"
          placeholder="Номер или email"
          defaultValue={search}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              updateParam("search", (event.target as HTMLInputElement).value);
            }
          }}
          className="rounded-lg border border-ink/15 px-2 py-1 text-sm bg-bg"
        />
      </div>

      {isLoading && <p className="text-ink-muted">Загрузка…</p>}

      {data && data.items.length === 0 && <p className="text-ink-muted">Заказы не найдены</p>}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-surface text-left text-ink-muted">
                <th className="px-3 py-2">Номер</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Клиент</th>
                <th className="px-3 py-2">Сумма</th>
                <th className="px-3 py-2">Дата</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((order) => (
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
                  <td className="px-3 py-2">
                    {order.full_name}
                    <span className="block text-xs text-ink-muted">{order.email}</span>
                  </td>
                  <td className="px-3 py-2 font-mono">{formatPrice(order.total)}</td>
                  <td className="px-3 py-2 font-mono">
                    {new Date(order.created_at).toLocaleDateString("ru-RU")}
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

export default function AdminOrdersPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-ink">Заказы</h1>
      <Suspense fallback={<p className="text-ink-muted">Загрузка…</p>}>
        <OrdersTable />
      </Suspense>
    </div>
  );
}
