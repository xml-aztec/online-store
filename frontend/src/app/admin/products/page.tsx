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
} from "@/entities/product/adminApi";
import { ApiError } from "@/shared/api/client";

const QUERY_KEY = "admin-products";

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
        <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Товары</h1>
        <p className="text-zinc-500">
          Управление товарами доступно только роли «admin» (ТЗ 6.4).
        </p>
      </div>
    );
  }

  const categories = categoriesData?.items ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Товары</h1>
        <Link
          href="/admin/products/new"
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Создать товар
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по названию…"
          className="w-64 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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
          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Любой статус</option>
          <option value="true">Активные</option>
          <option value="false">Скрытые</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <span>Выбрано: {selected.size}</span>
          <button
            type="button"
            onClick={() => bulkMutation.mutate(true)}
            disabled={bulkMutation.isPending}
            className="rounded border border-zinc-300 px-2 py-1 hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700"
          >
            Включить
          </button>
          <button
            type="button"
            onClick={() => bulkMutation.mutate(false)}
            disabled={bulkMutation.isPending}
            className="rounded border border-zinc-300 px-2 py-1 hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700"
          >
            Скрыть
          </button>
        </div>
      )}
      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {isLoading && <p className="text-zinc-500">Загрузка…</p>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-3 py-2" />
                <th className="px-3 py-2">Название</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
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
                      className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                    >
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{product.is_active ? "активен" : "скрыт"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => duplicateMutation.mutate(product.id)}
                      disabled={duplicateMutation.isPending}
                      className="text-sm text-zinc-500 underline hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
                    >
                      Дублировать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && (
            <p className="p-4 text-center text-zinc-500">Товары не найдены</p>
          )}
        </div>
      )}
    </div>
  );
}
