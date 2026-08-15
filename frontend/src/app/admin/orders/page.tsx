"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Download, MoreHorizontal, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ORDER_STATUS_LABELS } from "@/entities/orders/api";
import {
  getOrderStatusCounts,
  listAdminOrders,
  updateAdminOrderStatus,
} from "@/entities/orders/adminApi";
import { useToastStore } from "@/entities/toast/store";
import { formatPrice } from "@/shared/lib/formatPrice";
import { formatRelativeTime } from "@/shared/lib/formatRelativeTime";
import { useMountTransition } from "@/shared/lib/useMountTransition";
import { AdminPagination } from "@/shared/ui/AdminPagination";
import { StatusPill } from "@/shared/ui/StatusPill";
import { OrderDrawer } from "@/widgets/OrderDrawer";

const ROW_COLUMNS = "32px 160px 1fr 110px 150px 90px 32px";
const PAGE_SIZE = 50;

// Maps the mockup's status presets onto the 8 real order statuses -- some
// intentionally bucket more than one (e.g. "В сборке" covers both processing
// and shipped). "Проблемные" (stuck-order / unpaid-too-long) from the design
// is deliberately not included -- computing it honestly needs a server-side
// query across the *whole* filtered set, not just the current page; see
// docs/CHANGELOG.md.
const STATUS_BUCKETS: { key: string; label: string; statuses: string[] }[] = [
  { key: "all", label: "Все", statuses: [] },
  { key: "new", label: "Новые", statuses: ["pending", "awaiting_payment"] },
  { key: "paid", label: "Оплачены", statuses: ["paid"] },
  { key: "packing", label: "В сборке", statuses: ["processing", "shipped"] },
  { key: "delivered", label: "Доставлены", statuses: ["delivered"] },
  { key: "cancelled", label: "Отменены", statuses: ["cancelled", "refunded"] },
];

// Targets a manager would plausibly bulk-apply. "paid" is included because
// the single-order REST endpoint itself doesn't forbid it (see backend
// review), so this mirrors what's already possible one-at-a-time.
const BULK_STATUS_TARGETS = ["paid", "processing", "shipped", "delivered", "cancelled"];

function bucketCount(counts: Record<string, number> | undefined, statuses: string[]): number {
  if (!counts) return 0;
  if (statuses.length === 0) return Object.values(counts).reduce((sum, n) => sum + n, 0);
  return statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}

function OrdersTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg" aria-busy="true" aria-label="Загрузка заказов">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="grid items-center gap-2 border-b border-surface px-[18px] py-2.5 last:border-0"
          style={{ gridTemplateColumns: ROW_COLUMNS }}
        >
          <div className="h-[15px] w-[15px] animate-pulse rounded bg-surface" />
          <div className="h-3.5 w-16 animate-pulse rounded bg-surface" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface" />
          </div>
          <div className="ml-auto h-3.5 w-16 animate-pulse rounded bg-surface" />
          <div className="ml-3 h-5 w-20 animate-pulse rounded-full bg-surface" />
          <div className="ml-auto h-3 w-12 animate-pulse rounded bg-surface" />
          <div />
        </div>
      ))}
    </div>
  );
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadOrdersCsv(items: { number: string; full_name: string; email: string; total: string; status: string; created_at: string }[]) {
  const header = ["Номер", "Клиент", "Email", "Сумма", "Статус", "Дата"];
  const rows = items.map((o) => [
    o.number,
    o.full_name,
    o.email,
    o.total,
    ORDER_STATUS_LABELS[o.status] ?? o.status,
    new Date(o.created_at).toLocaleString("ru-RU"),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  // ﻿: Excel on Windows won't guess UTF-8 without a BOM and mangles cyrillic.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
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
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-bg px-3 font-mono text-xs font-medium text-ink"
      >
        <Calendar className="h-[13px] w-[13px] text-ink-muted" aria-hidden="true" strokeWidth={2} />
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 flex flex-col gap-2 rounded-lg border border-border bg-bg p-3 shadow-lg">
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            От
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => onChange(event.target.value, dateTo)}
              className="rounded-lg border border-border bg-bg px-2 py-1 font-mono text-xs text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            До
            <input
              type="date"
              value={dateTo}
              onChange={(event) => onChange(dateFrom, event.target.value)}
              className="rounded-lg border border-border bg-bg px-2 py-1 font-mono text-xs text-ink"
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

const BULK_BAR_TRANSITION_MS = 300;

function BulkBar({
  selectedIds,
  items,
  onClear,
}: {
  selectedIds: Set<string>;
  items: { id: string; number: string; total: string; status: string; email: string; full_name: string; created_at: string }[];
  onClear: () => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [target, setTarget] = useState(BULK_STATUS_TARGETS[1]); // "processing"
  const [pending, setPending] = useState(false);
  const active = selectedIds.size > 0;
  const { shouldRender, isVisible } = useMountTransition(active, BULK_BAR_TRANSITION_MS);

  // Keeps showing the selection that was actually acted on while the bar
  // fades out, instead of snapping to "Выбрано 0" for the trailing ~300ms
  // of the exit animation (selectedIds is already empty by then).
  const [displaySelection, setDisplaySelection] = useState({ selectedIds, items });
  if (active && displaySelection.selectedIds !== selectedIds) {
    setDisplaySelection({ selectedIds, items });
  }

  async function applyBulkStatus() {
    setPending(true);
    const ids = [...displaySelection.selectedIds];
    const results = await Promise.allSettled(ids.map((id) => updateAdminOrderStatus(id, target)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    setPending(false);
    void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-order-status-counts"] });
    if (failed === 0) {
      pushToast(`Статус «${ORDER_STATUS_LABELS[target] ?? target}» применён к ${succeeded} заказам`);
    } else {
      pushToast(
        `Обновлено ${succeeded} из ${ids.length} — ${failed} заказ(ов) не поддерживают этот переход`,
        "error"
      );
    }
    onClear();
  }

  if (!shouldRender) return null;

  return (
    <div className="sticky bottom-4 z-10 flex justify-center">
      {/* Floating bar is deliberately always-dark like the [#2C3038] button
          inside it (not `bg-ink`, which flips light in dark mode and would
          leave the white text unreadable). Slides up on select, back down on
          clear/act -- transform+opacity only. */}
      <div
        className={`flex flex-wrap items-center gap-3 rounded-xl bg-[#14161a] px-4 py-2.5 text-white shadow-[0_12px_32px_rgba(20,22,26,0.3)] transition-[opacity,transform] duration-300 ${
          isVisible ? "translate-y-0 opacity-100 ease-out" : "translate-y-3 opacity-0 ease-in"
        }`}
      >
        <span className="text-[13px] font-medium">
          Выбрано{" "}
          <span className="font-mono font-bold">{displaySelection.selectedIds.size}</span>
        </span>
        <span className="h-5 w-px bg-white/20" />
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="h-[34px] rounded-lg border border-white/20 bg-transparent px-2.5 font-display text-[13px] font-semibold text-white"
        >
          {BULK_STATUS_TARGETS.map((status) => (
            <option key={status} value={status} className="text-ink">
              {ORDER_STATUS_LABELS[status] ?? status}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={() => void applyBulkStatus()}
          className="h-[34px] rounded-lg bg-brand px-3.5 font-display text-[13px] font-bold text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {pending ? "Применяем…" : "Сменить статус"}
        </button>
        <button
          type="button"
          onClick={() =>
            downloadOrdersCsv(
              displaySelection.items.filter((o) => displaySelection.selectedIds.has(o.id))
            )
          }
          className="flex h-[34px] items-center gap-1.5 rounded-lg bg-[#2C3038] px-3.5 font-display text-[13px] font-semibold text-white hover:bg-[#3A3F48]"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Экспорт CSV
        </button>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-white/70 hover:text-white"
        >
          Снять выбор
        </button>
      </div>
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
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const openOrderId = searchParams.get("order");
  const bucket = STATUS_BUCKETS.find((b) => b.key === bucketKey) ?? STATUS_BUCKETS[0];

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: statusCounts } = useQuery({
    queryKey: ["admin-order-status-counts"],
    queryFn: getOrderStatusCounts,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", bucketKey, search, dateFrom, dateTo, page],
    queryFn: () =>
      listAdminOrders({
        status: bucket.statuses.length > 0 ? bucket.statuses : undefined,
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  function updateParam(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!("page" in updates)) params.delete("page");
    router.push(`/admin/orders?${params.toString()}`);
  }

  function openOrder(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("order", id);
    router.push(`/admin/orders?${params.toString()}`);
  }

  function closeOrder() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("order");
    router.push(`/admin/orders?${params.toString()}`);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = Boolean(data?.items.length) && data!.items.every((o) => selectedIds.has(o.id));

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
              placeholder="№ заказа, клиент, email…"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  updateParam({ search: (event.target as HTMLInputElement).value });
                }
              }}
              className="h-9 w-[240px] rounded-lg border border-border bg-bg pl-8 pr-3 text-xs text-ink outline-none focus:border-brand"
            />
          </div>
          <PeriodPicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(from, to) => updateParam({ from, to })}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {STATUS_BUCKETS.map((b) => {
          const active = b.key === bucketKey;
          const count = bucketCount(statusCounts?.counts, b.statuses);
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => updateParam({ bucket: b.key === "all" ? "" : b.key })}
              className={`whitespace-nowrap border-b-2 px-3 py-2 font-display text-[13px] transition ${
                active
                  ? "border-brand font-bold text-brand-text"
                  : "border-transparent font-semibold text-ink-muted hover:text-ink"
              }`}
            >
              {b.label} <span className="font-mono text-xs">{count}</span>
            </button>
          );
        })}
      </div>

      {isLoading && <OrdersTableSkeleton />}

      {data && data.items.length === 0 && (
        <p className="animate-content-fade-in text-ink-muted">Заказы не найдены</p>
      )}

      {data && data.items.length > 0 && (
        <div className="animate-content-fade-in overflow-hidden rounded-xl border border-border bg-bg">
          <div
            className="grid items-center gap-2 border-b border-border px-[18px] py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
            style={{ gridTemplateColumns: ROW_COLUMNS }}
          >
            <RowCheckbox
              checked={allSelected}
              onChange={() =>
                setSelectedIds(allSelected ? new Set() : new Set(data.items.map((o) => o.id)))
              }
            />
            <span>№</span>
            <span>Клиент</span>
            <span className="text-right">Сумма</span>
            <span className="pl-3">Статус</span>
            <span className="text-right">Поступил</span>
            <span />
          </div>
          {data.items.map((order) => (
            <div
              key={order.id}
              className="group grid items-center gap-2 border-b border-surface px-[18px] py-2.5 text-[13px] last:border-0 hover:bg-surface"
              style={{ gridTemplateColumns: ROW_COLUMNS }}
            >
              <RowCheckbox checked={selectedIds.has(order.id)} onChange={() => toggleSelected(order.id)} />
              <button
                type="button"
                onClick={() => openOrder(order.id)}
                className="truncate text-left font-mono font-semibold text-ink hover:underline"
              >
                {order.number}
              </button>
              <button type="button" onClick={() => openOrder(order.id)} className="flex min-w-0 flex-col gap-px text-left">
                <span className="truncate font-medium text-ink">{order.full_name}</span>
                <span className="truncate font-mono text-[11px] text-ink-muted">{order.email}</span>
              </button>
              <button
                type="button"
                onClick={() => openOrder(order.id)}
                className="text-right font-mono font-semibold text-ink"
              >
                {formatPrice(order.total)}
              </button>
              <button type="button" onClick={() => openOrder(order.id)} className="pl-3 text-left">
                <StatusPill status={order.status} />
              </button>
              <button
                type="button"
                onClick={() => openOrder(order.id)}
                className="text-right font-mono text-xs text-ink-muted"
              >
                {formatRelativeTime(order.created_at)}
              </button>
              <span className="flex justify-center opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  title="Открыть (↵)"
                  onClick={() => openOrder(order.id)}
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-ink-muted hover:bg-border/60 hover:text-ink"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {data && (
        <AdminPagination
          page={page}
          pageSize={data.page_size}
          total={data.total}
          onPageChange={(next) => updateParam({ page: String(next) })}
        />
      )}

      {data && (
        <BulkBar selectedIds={selectedIds} items={data.items} onClear={() => setSelectedIds(new Set())} />
      )}

      <OrderDrawer
        orderId={openOrderId}
        orderIds={data?.items.map((o) => o.id) ?? []}
        onClose={closeOrder}
        onNavigate={openOrder}
      />
    </div>
  );
}

function RowCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={`flex h-[15px] w-[15px] items-center justify-center rounded ${
        checked ? "bg-brand" : "border-[1.5px] border-ink/25"
      }`}
    >
      {checked && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Загрузка…</p>}>
      <OrdersTable />
    </Suspense>
  );
}
