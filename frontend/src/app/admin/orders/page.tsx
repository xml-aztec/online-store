"use client";

import { useQuery } from "@tanstack/react-query";
import { Calendar, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { getOrderStatusCounts, listAdminOrders } from "@/entities/orders/adminApi";
import { formatPrice } from "@/shared/lib/formatPrice";
import { StatusPill } from "@/shared/ui/StatusPill";

const ROW_COLUMNS = "100px 1fr 140px 150px 130px 40px";

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

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function PeriodPicker({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label =
    dateFrom || dateTo
      ? `${dateFrom ? formatShortDate(dateFrom) : "…"} — ${dateTo ? formatShortDate(dateTo) : "…"}`
      : "за всё время";

  return (
    <div
      className="relative flex items-center gap-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <span className="text-xs text-ink-muted">Период:</span>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-lg border border-ink/15 bg-bg px-3 font-mono text-xs font-medium text-ink"
      >
        {label}
        <Calendar className="h-[13px] w-[13px] text-ink-muted" aria-hidden="true" strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 flex flex-col gap-2 rounded-lg border border-ink/10 bg-bg p-3 shadow-lg">
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            От
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => onChange(event.target.value, dateTo)}
              className="rounded-lg border border-ink/15 px-2 py-1 font-mono text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            До
            <input
              type="date"
              value={dateTo}
              onChange={(event) => onChange(dateFrom, event.target.value)}
              className="rounded-lg border border-ink/15 px-2 py-1 font-mono text-xs"
            />
          </label>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => onChange("", "")}
              className="text-left text-xs font-medium text-ink-muted underline hover:text-ink"
            >
              Сбросить период
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OrdersTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bucketKey = searchParams.get("bucket") ?? "all";
  const search = searchParams.get("search") ?? "";
  const dateFrom = searchParams.get("from") ?? "";
  const dateTo = searchParams.get("to") ?? "";
  const bucket = STATUS_BUCKETS.find((b) => b.key === bucketKey) ?? STATUS_BUCKETS[0];

  const { data: statusCounts } = useQuery({
    queryKey: ["admin-order-status-counts"],
    queryFn: getOrderStatusCounts,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", bucketKey, search, dateFrom, dateTo],
    queryFn: () =>
      listAdminOrders({
        status: bucket.statuses.length > 0 ? bucket.statuses : undefined,
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
        page: 1,
        pageSize: 50,
      }),
  });

  function updateParam(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/admin/orders?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[22px] font-extrabold text-ink">Заказы</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
              strokeWidth={2.2}
            />
            <input
              type="search"
              defaultValue={search}
              placeholder="Номер или email"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  updateParam({ search: (event.target as HTMLInputElement).value });
                }
              }}
              className="h-9 rounded-lg border border-ink/15 bg-bg pl-8 pr-3 text-xs outline-none focus:border-brand"
            />
          </div>
          <PeriodPicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(from, to) => updateParam({ from, to })}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_BUCKETS.map((b) => {
          const active = b.key === bucketKey;
          const count = bucketCount(statusCounts?.counts, b.statuses);
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => updateParam({ bucket: b.key === "all" ? "" : b.key })}
              className={`whitespace-nowrap rounded-lg font-display text-[13px] font-bold transition ${
                active
                  ? "bg-brand px-3.5 py-2 text-white"
                  : "border border-ink/15 bg-bg px-[13px] py-[7px] text-ink hover:border-ink/30"
              }`}
            >
              {b.label} <span className="font-mono">{count}</span>
            </button>
          );
        })}
      </div>

      {isLoading && <p className="text-ink-muted">Загрузка…</p>}

      {data && data.items.length === 0 && <p className="text-ink-muted">Заказы не найдены</p>}

      {data && data.items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-bg">
          <div
            className="grid items-center gap-2 border-b border-ink/10 px-[18px] py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
            style={{ gridTemplateColumns: ROW_COLUMNS }}
          >
            <span>№</span>
            <span>Клиент</span>
            <span className="text-right">Сумма, сом</span>
            <span className="pl-4">Статус</span>
            <span className="text-right">Дата</span>
            <span />
          </div>
          {data.items.map((order) => (
            <Link
              key={order.id}
              href={`/admin/orders/${order.id}`}
              className="grid items-center gap-2 border-b border-surface px-[18px] py-2.5 text-[13px] last:border-0 hover:bg-[#FAFBFC]"
              style={{ gridTemplateColumns: ROW_COLUMNS }}
            >
              <span className="font-mono font-semibold text-ink">{order.number}</span>
              <span className="flex min-w-0 flex-col gap-px">
                <span className="truncate font-medium text-ink">{order.full_name}</span>
                <span className="truncate font-mono text-[11px] text-ink-muted">
                  {order.email}
                </span>
              </span>
              <span className="text-right font-mono font-semibold text-ink">
                {formatPrice(order.total)}
              </span>
              <span className="pl-4">
                <StatusPill status={order.status} />
              </span>
              <span className="text-right font-mono text-xs text-ink-muted">
                {formatShortDate(order.created_at)}
              </span>
              <span className="flex justify-center text-ink-muted">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Загрузка…</p>}>
      <OrdersTable />
    </Suspense>
  );
}
