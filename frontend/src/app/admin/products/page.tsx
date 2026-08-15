"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Image as ImageIcon, MoreHorizontal, Search } from "lucide-react";

import { useAuthStore } from "@/entities/auth/store";
import { listAdminCategories } from "@/entities/category/adminApi";
import {
  bulkSetAdminProductsActive,
  duplicateAdminProduct,
  listAdminProducts,
  updateAdminProduct,
  updateAdminVariant,
} from "@/entities/product/adminApi";
import type { AdminProductListItem } from "@/entities/product/adminApi";
import { useToastStore } from "@/entities/toast/store";
import { ApiError } from "@/shared/api/client";
import { useMountTransition } from "@/shared/lib/useMountTransition";
import { Toggle } from "@/shared/ui/Toggle";
import { ProductDrawer } from "@/widgets/ProductDrawer";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

const QUERY_KEY = "admin-products";
const ROW_COLUMNS = "32px 56px 1fr 130px 130px 96px 90px 32px";

function ProductsTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg" aria-busy="true" aria-label="Загрузка товаров">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="grid items-center gap-2 border-b border-surface px-[18px] py-2.5 last:border-0"
          style={{ gridTemplateColumns: ROW_COLUMNS }}
        >
          <div className="h-4 w-4 animate-pulse rounded bg-surface" />
          <div className="h-10 w-10 animate-pulse rounded-lg bg-surface" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-surface" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface" />
          </div>
          <div className="h-3.5 w-4/5 animate-pulse rounded bg-surface" />
          <div className="ml-auto h-3.5 w-16 animate-pulse rounded bg-surface" />
          <div className="ml-auto h-3.5 w-10 animate-pulse rounded bg-surface" />
          <div className="mx-auto h-5 w-9 animate-pulse rounded-full bg-surface" />
          <div />
        </div>
      ))}
    </div>
  );
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadProductsCsv(items: AdminProductListItem[]) {
  const header = ["Название", "SKU/слаг", "Цена", "Остаток", "Активен"];
  const rows = items.map((p) => [
    p.name,
    p.slug,
    p.price_from ?? "",
    String(p.total_stock_qty),
    p.is_active ? "да" : "нет",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

interface EditableCellProps {
  value: string;
  onSave: (next: string) => void;
  colorClass?: string;
}

// Click-to-edit price/stock cell: click enters edit mode, Enter saves, Esc
// cancels -- only offered for single-variant products (see PriceStockCells),
// so there's never ambiguity about which variant is being edited.
function EditableCell({ value, onSave, colorClass }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            setEditing(false);
            if (draft !== value) onSave(draft);
          } else if (event.key === "Escape") {
            setEditing(false);
          }
        }}
        className="animate-cell-edit-in h-8 w-full rounded-lg border border-brand bg-bg px-2.5 text-right font-mono text-[13px] font-semibold text-ink outline-none ring-2 ring-brand/20"
      />
    );
  }

  return (
    <button
      type="button"
      title="Нажмите, чтобы изменить (E)"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={`-my-1.5 -mr-2 w-full rounded-md px-2 py-1.5 text-right font-mono text-[13px] font-semibold hover:bg-surface ${colorClass ?? "text-ink"}`}
    >
      {value}
    </button>
  );
}

function PriceStockCells({ product }: { product: AdminProductListItem }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ field, value }: { field: "price" | "stock_qty"; value: string }) =>
      updateAdminVariant(product.id, product.single_variant_id!, {
        [field]: field === "price" ? value : Number(value),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });

  if (product.variant_count !== 1 || !product.single_variant_id) {
    return (
      <span style={{ gridColumn: "span 2" }} className="text-center text-[13px] text-ink-muted">
        {product.variant_count} вариантов
      </span>
    );
  }

  return (
    <>
      <EditableCell
        value={product.price_from ?? "0"}
        onSave={(value) => mutation.mutate({ field: "price", value })}
      />
      <EditableCell
        value={String(product.total_stock_qty)}
        onSave={(value) => mutation.mutate({ field: "stock_qty", value })}
        colorClass={product.total_stock_qty <= 0 ? "text-accent-sale-700" : undefined}
      />
    </>
  );
}

function ActiveToggle({ product }: { product: AdminProductListItem }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (isActive: boolean) => updateAdminProduct(product.id, { is_active: isActive }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });

  return (
    <Toggle
      checked={product.is_active}
      disabled={mutation.isPending}
      onChange={(checked) => mutation.mutate(checked)}
      label={`Товар ${product.is_active ? "активен" : "скрыт"}: ${product.name}`}
    />
  );
}

function RowMenu({ product, onOpen }: { product: AdminProductListItem; onOpen: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateAdminProduct(product.id),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      onOpen(); // reopen the drawer, now pointed at the duplicate isn't possible without its id
      void created;
    },
  });

  return (
    <div
      className="relative flex justify-center"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Действия с товаром"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface hover:text-ink"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-bg py-1 shadow-lg">
          <button
            type="button"
            onClick={() => duplicateMutation.mutate()}
            disabled={duplicateMutation.isPending}
            className="block w-full px-3 py-2 text-left text-[13px] text-ink hover:bg-surface disabled:opacity-50"
          >
            {duplicateMutation.isPending ? "Дублирование…" : "Дублировать"}
          </button>
          {duplicateMutation.isError && (
            <p className="px-3 py-1.5 text-xs text-accent-sale-700">
              {errorMessage(duplicateMutation.error, "Не удалось дублировать товар")}
            </p>
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
  items: AdminProductListItem[];
  onClear: () => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
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

  async function setActive(isActive: boolean) {
    setPending(true);
    try {
      const { updated } = await bulkSetAdminProductsActive([...selectedIds], isActive);
      pushToast(`${isActive ? "Включено" : "Выключено"} товаров: ${updated}`);
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    } catch (error) {
      pushToast(errorMessage(error, "Не удалось изменить статус товаров"), "error");
    } finally {
      setPending(false);
      onClear();
    }
  }

  if (!shouldRender) return null;

  return (
    <div className="sticky bottom-4 z-10 flex justify-center">
      {/* Floating bar is deliberately always-dark like the [#2C3038] buttons
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
        <button
          type="button"
          disabled={pending}
          onClick={() => void setActive(true)}
          className="h-[34px] rounded-lg bg-[#2C3038] px-3.5 font-display text-[13px] font-semibold text-white hover:bg-[#3A3F48] disabled:opacity-50"
        >
          Включить
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void setActive(false)}
          className="h-[34px] rounded-lg bg-[#2C3038] px-3.5 font-display text-[13px] font-semibold text-white hover:bg-[#3A3F48] disabled:opacity-50"
        >
          Выключить
        </button>
        <button
          type="button"
          onClick={() =>
            downloadProductsCsv(
              displaySelection.items.filter((p) => displaySelection.selectedIds.has(p.id))
            )
          }
          className="flex h-[34px] items-center gap-1.5 rounded-lg bg-[#2C3038] px-3.5 font-display text-[13px] font-semibold text-white hover:bg-[#3A3F48]"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Экспорт
        </button>
        <button type="button" onClick={onClear} className="text-xs text-white/70 hover:text-white">
          Снять выбор
        </button>
      </div>
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

function ProductsTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useAuthStore((state) => state.role);
  const [search, setSearch] = useState("");
  const categoryId = searchParams.get("category") ?? "";
  const openProductId = searchParams.get("product");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: categoriesData } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => listAdminCategories(1, 100),
    enabled: role === "admin",
  });
  const categories = categoriesData?.items ?? [];
  const categoryNameById = useMemo(
    () => new Map((categoriesData?.items ?? []).map((category) => [category.id, category.name])),
    [categoriesData]
  );

  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEY, search, categoryId],
    queryFn: () =>
      listAdminProducts({
        search: search || undefined,
        categoryId: categoryId || undefined,
        page: 1,
        pageSize: 100,
      }),
    enabled: role === "admin",
  });

  function setCategoryFilter(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("category", id);
    else params.delete("category");
    router.push(`/admin/products?${params.toString()}`);
  }

  function openProduct(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("product", id);
    router.push(`/admin/products?${params.toString()}`);
  }

  function closeProduct() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("product");
    router.push(`/admin/products?${params.toString()}`);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (role !== "admin") {
    return (
      <div>
        <h1 className="mb-6 font-display text-xl font-extrabold text-ink">Товары</h1>
        <p className="text-ink-muted">Управление товарами доступно только роли «admin» (ТЗ 6.4).</p>
      </div>
    );
  }

  const allSelected = Boolean(data?.items.length) && data!.items.every((p) => selectedIds.has(p.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[22px] font-extrabold text-ink">
          Товары{" "}
          {data && (
            <span className="font-mono text-[15px] font-semibold text-ink-muted">{data.total}</span>
          )}
        </h1>
        <div className="relative w-[260px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
            strokeWidth={2.2}
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            type="text"
            placeholder="Название или SKU…"
            className="h-9 w-full rounded-lg border border-border bg-bg pl-8 pr-3 text-xs text-ink outline-none focus:border-brand"
          />
        </div>
        <div className="ml-auto flex gap-2">
          <Link
            href="/admin/imports"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-bg px-3.5 font-display text-[13px] font-bold text-ink hover:border-ink/30"
          >
            <Download className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            Импорт из Excel
          </Link>
          <Link
            href="/admin/products/new"
            className="flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg bg-brand px-4 font-display text-[13px] font-bold text-white hover:bg-brand/90"
          >
            + Добавить товар
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCategoryFilter("")}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-display text-xs font-bold ${
            !categoryId ? "bg-brand text-white" : "border border-border bg-bg text-ink hover:border-ink/30"
          }`}
        >
          Все
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setCategoryFilter(category.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-display text-xs font-semibold ${
              categoryId === category.id
                ? "bg-brand text-white"
                : "border border-border bg-bg text-ink hover:border-ink/30"
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      {isLoading && <ProductsTableSkeleton />}

      {data && (
        <div className="animate-content-fade-in overflow-hidden rounded-xl border border-border bg-bg">
          <div
            className="grid items-center gap-2 border-b border-border px-[18px] py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
            style={{ gridTemplateColumns: ROW_COLUMNS }}
          >
            <RowCheckbox
              checked={allSelected}
              onChange={() =>
                setSelectedIds(allSelected ? new Set() : new Set(data.items.map((p) => p.id)))
              }
            />
            <span>Фото</span>
            <span>Название / SKU</span>
            <span>Категория</span>
            <span className="text-right">Цена, сом</span>
            <span className="text-right">Остаток</span>
            <span className="text-center">Активен</span>
            <span />
          </div>

          {data.items.map((product) => (
            <div
              key={product.id}
              className="group grid items-center gap-2 border-b border-surface px-[18px] py-2.5 text-[13px] last:border-0 hover:bg-surface"
              style={{ gridTemplateColumns: ROW_COLUMNS }}
            >
              <RowCheckbox checked={selectedIds.has(product.id)} onChange={() => toggleSelected(product.id)} />
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface">
                <ImageIcon className="h-4 w-4 text-ink-muted/40" aria-hidden="true" strokeWidth={2} />
              </span>
              <button
                type="button"
                onClick={() => openProduct(product.id)}
                className="flex min-w-0 flex-col gap-px text-left"
              >
                <span className="truncate font-medium text-ink">{product.name}</span>
                <span className="truncate font-mono text-[11px] text-ink-muted">{product.slug}</span>
              </button>
              <span className="truncate text-ink-muted">
                {categoryNameById.get(product.category_id) ?? "—"}
              </span>
              <PriceStockCells product={product} />
              <div className="flex justify-center">
                <ActiveToggle product={product} />
              </div>
              <span className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  title="Редактировать (↵)"
                  onClick={() => openProduct(product.id)}
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-ink-muted hover:bg-border/60 hover:text-ink"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <RowMenu product={product} onOpen={() => openProduct(product.id)} />
              </span>
            </div>
          ))}

          {data.items.length === 0 && (
            <p className="p-6 text-center text-ink-muted">Товары не найдены</p>
          )}
        </div>
      )}

      <p className="text-xs text-ink-muted">
        Клик по цене или остатку открывает поле прямо в ячейке — Enter сохраняет, Esc отменяет.
      </p>

      {data && (
        <BulkBar selectedIds={selectedIds} items={data.items} onClear={() => setSelectedIds(new Set())} />
      )}

      <ProductDrawer productId={openProductId} onClose={closeProduct} />
    </div>
  );
}

export default function AdminProductsPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Загрузка…</p>}>
      <ProductsTable />
    </Suspense>
  );
}
