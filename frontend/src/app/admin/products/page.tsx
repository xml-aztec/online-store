"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
import { ApiError } from "@/shared/api/client";
import { Toggle } from "@/shared/ui/Toggle";

const QUERY_KEY = "admin-products";

interface EditableCellProps {
  value: string;
  onSave: (next: string) => void;
  align?: "left" | "right";
}

// Click-to-edit price/stock cell: click enters edit mode, Enter saves, Esc
// cancels -- only offered for single-variant products (see PriceStockCell),
// so there's never ambiguity about which variant is being edited.
function EditableCell({ value, onSave, align = "right" }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        title="Нажмите, чтобы изменить"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={`w-full rounded px-1.5 py-1 font-mono hover:bg-surface ${
          align === "right" ? "text-right" : "text-left"
        }`}
      >
        {value}
      </button>
    );
  }

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
      className={`w-24 rounded-lg border border-brand px-2 py-1 font-mono text-sm shadow-[0_0_0_3px_var(--color-brand)/0.15] focus:outline-none ${
        align === "right" ? "text-right" : "text-left"
      }`}
    />
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
      <td className="px-3 py-2 text-center" colSpan={2}>
        <Link
          href={`/admin/products/${product.id}`}
          className="text-ink-muted underline hover:text-ink"
        >
          {product.variant_count} вариантов
        </Link>
      </td>
    );
  }

  return (
    <>
      <td className="px-3 py-2">
        <EditableCell
          value={product.price_from ?? "0"}
          onSave={(value) => mutation.mutate({ field: "price", value })}
        />
      </td>
      <td className="px-3 py-2">
        <EditableCell
          value={String(product.total_stock_qty)}
          onSave={(value) => mutation.mutate({ field: "stock_qty", value })}
        />
      </td>
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

export default function AdminProductsPage() {
  const role = useAuthStore((state) => state.role);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "true" | "false">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data: categoriesData } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => listAdminCategories(1, 100),
    enabled: role === "admin",
  });

  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEY, search, categoryId, statusFilter],
    queryFn: () =>
      listAdminProducts({
        search: search || undefined,
        categoryId: categoryId || undefined,
        isActive: statusFilter === "" ? undefined : statusFilter === "true",
        page: 1,
        pageSize: 100,
      }),
    enabled: role === "admin",
  });

  const duplicateMutation = useMutation({
    mutationFn: (productId: string) => duplicateAdminProduct(productId),
    onSuccess: (created) => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      router.push(`/admin/products/${created.id}`);
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Не удалось дублировать товар"),
  });

  const bulkMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      bulkSetAdminProductsActive(Array.from(selected), isActive),
    onSuccess: () => {
      setError(null);
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Не удалось изменить статус"),
  });

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (role !== "admin") {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-ink">Товары</h1>
        <p className="text-ink-muted">
          Управление товарами доступно только роли «admin» (ТЗ 6.4).
        </p>
      </div>
    );
  }

  const categories = categoriesData?.items ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink">Товары</h1>
        <Link
          href="/admin/products/new"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          Создать товар
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по названию…"
          className="w-64 rounded-lg border border-ink/15 px-3 py-2 text-sm bg-bg"
        />
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="rounded-lg border border-ink/15 px-3 py-2 text-sm bg-bg"
        >
          <option value="">Все категории</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "" | "true" | "false")}
          className="rounded-lg border border-ink/15 px-3 py-2 text-sm bg-bg"
        >
          <option value="">Любой статус</option>
          <option value="true">Активные</option>
          <option value="false">Скрытые</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-ink/10 p-3 text-sm">
          <span>Выбрано: {selected.size}</span>
          <button
            type="button"
            onClick={() => bulkMutation.mutate(true)}
            disabled={bulkMutation.isPending}
            className="rounded-lg border border-ink/15 px-2 py-1 hover:border-brand/40 disabled:opacity-50"
          >
            Включить
          </button>
          <button
            type="button"
            onClick={() => bulkMutation.mutate(false)}
            disabled={bulkMutation.isPending}
            className="rounded-lg border border-ink/15 px-2 py-1 hover:border-brand/40 disabled:opacity-50"
          >
            Скрыть
          </button>
        </div>
      )}
      {error && <p className="mb-4 text-sm text-accent-sale-700">{error}</p>}

      {isLoading && <p className="text-ink-muted">Загрузка…</p>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-surface text-left text-ink-muted">
                <th className="px-3 py-2" />
                <th className="px-3 py-2">Название</th>
                <th className="px-3 py-2 text-right">Цена, сом</th>
                <th className="px-3 py-2 text-right">Остаток</th>
                <th className="px-3 py-2 text-center">Активен</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-ink/10 last:border-0"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggleSelected(product.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {product.name}
                    </Link>
                  </td>
                  <PriceStockCells product={product} />
                  <td className="px-3 py-2">
                    <div className="flex justify-center">
                      <ActiveToggle product={product} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => duplicateMutation.mutate(product.id)}
                      disabled={duplicateMutation.isPending}
                      className="text-sm text-ink-muted underline hover:text-ink disabled:opacity-50"
                    >
                      Дублировать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && (
            <p className="p-4 text-center text-ink-muted">Товары не найдены</p>
          )}
        </div>
      )}
    </div>
  );
}
