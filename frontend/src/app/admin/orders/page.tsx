"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ORDER_STATUS_LABELS } from "@/entities/orders/api";
import { listAdminOrders } from "@/entities/orders/adminApi";
import { formatPrice } from "@/shared/lib/formatPrice";
import { orderStatusPillClass } from "@/shared/lib/orderStatusStyles";

const STATUS_OPTIONS = Object.keys(ORDER_STATUS_LABELS);

function OrdersTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search") ?? "";
  const page = Number(searchParams.get("page") ?? "1");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", status, search, page],
    queryFn: () =>
      listAdminOrders({
        status: status || undefined,
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
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(event) => updateParam("status", event.target.value)}
          className="rounded-lg border border-ink/15 px-2 py-1 text-sm bg-bg"
        >
          <option value="">Все статусы</option>
          {STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {ORDER_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
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
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${orderStatusPillClass(order.status)}`}
                    >
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </span>
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
