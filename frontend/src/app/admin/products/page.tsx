"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Image as ImageIcon, MoreHorizontal, Search } from "lucide-react";

import { useAuthStore } from "@/entities/auth/store";
import { listAdminCategories } from "@/entities/category/adminApi";
import {
  duplicateAdminProduct,
  listAdminProducts,
  updateAdminProduct,
  updateAdminVariant,
} from "@/entities/product/adminApi";
import type { AdminProductListItem } from "@/entities/product/adminApi";
import { ApiError } from "@/shared/api/client";
import { Toggle } from "@/shared/ui/Toggle";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

const QUERY_KEY = "admin-products";
const ROW_COLUMNS = "56px 1fr 130px 130px 96px 90px 40px";

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
        className="h-8 w-full rounded-lg border border-brand px-2.5 text-right font-mono text-[13px] font-semibold shadow-[0_0_0_3px_rgba(47,90,245,0.12)] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      title="Нажмите, чтобы изменить"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={`-my-1.5 -mr-2 w-full rounded-md px-2 py-1.5 text-right font-mono text-[13px] font-semibold hover:bg-surface ${colorClass ?? ""}`}
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
      <Link
        href={`/admin/products/${product.id}`}
        style={{ gridColumn: "span 2" }}
        className="text-center text-[13px] text-ink-muted underline decoration-ink-muted/40 hover:text-ink"
      >
        {product.variant_count} вариантов
      </Link>
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

function RowMenu({ product }: { product: AdminProductListItem }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateAdminProduct(product.id),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      router.push(`/admin/products/${created.id}`);
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
        <div className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-lg border border-ink/10 bg-bg py-1 shadow-lg">
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

export default function AdminProductsPage() {
  const role = useAuthStore((state) => state.role);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");

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

  if (role !== "admin") {
    return (
      <div>
        <h1 className="mb-6 font-display text-xl font-extrabold text-ink">Товары</h1>
        <p className="text-ink-muted">Управление товарами доступно только роли «admin» (ТЗ 6.4).</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[22px] font-extrabold text-ink">
          Товары{" "}
          {data && (
            <span className="font-mono text-[15px] font-semibold text-ink-muted">
              {data.total}
            </span>
          )}
        </h1>
        <div className="flex max-w-[640px] flex-1 gap-2.5">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
              strokeWidth={2.2}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              type="text"
              placeholder="Поиск по названию или SKU"
              className="h-[38px] w-full rounded-lg border border-ink/15 bg-bg pl-9 pr-3 text-[13px] outline-none focus:border-brand"
            />
          </div>
          <div className="relative">
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              aria-label="Фильтр по категории"
              className="h-[38px] w-full appearance-none rounded-lg border border-ink/15 bg-bg py-0 pl-3 pr-8 text-[13px] font-medium text-ink outline-none focus:border-brand"
            >
              <option value="">Категория: Все</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  Категория: {category.name}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
              strokeWidth={2.2}
            />
          </div>
        </div>
        <Link
          href="/admin/products/new"
          className="flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-lg bg-brand px-[18px] font-display text-sm font-bold text-white hover:bg-brand/90"
        >
          + Добавить товар
        </Link>
      </div>

      {isLoading && <p className="text-ink-muted">Загрузка…</p>}

      {data && (
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-bg">
          <div
            className="grid items-center gap-2 border-b border-ink/10 px-[18px] py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
            style={{ gridTemplateColumns: ROW_COLUMNS }}
          >
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
              className="grid items-center gap-2 border-b border-surface px-[18px] py-2.5 text-[13px] last:border-0 hover:bg-[#FAFBFC]"
              style={{ gridTemplateColumns: ROW_COLUMNS }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface">
                <ImageIcon className="h-4 w-4 text-ink/25" aria-hidden="true" strokeWidth={2} />
              </span>
              <Link
                href={`/admin/products/${product.id}`}
                className="flex min-w-0 flex-col gap-px"
              >
                <span className="truncate font-medium text-ink">{product.name}</span>
                <span className="truncate font-mono text-[11px] text-ink-muted">
                  {product.slug}
                </span>
              </Link>
              <span className="truncate text-ink-muted">
                {categoryNameById.get(product.category_id) ?? "—"}
              </span>
              <PriceStockCells product={product} />
              <div className="flex justify-center">
                <ActiveToggle product={product} />
              </div>
              <RowMenu product={product} />
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
    </div>
  );
}
