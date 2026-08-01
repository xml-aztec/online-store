"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@/entities/auth/store";
import {
  createAdminCategory,
  deleteAdminCategory,
  listAdminCategories,
  updateAdminCategory,
  type AdminCategory,
} from "@/entities/category/adminApi";
import { ApiError } from "@/shared/api/client";
import { slugify } from "@/shared/lib/slugify";

const QUERY_KEY = ["admin-categories"];

function CategoryRow({
  category,
  categories,
}: {
  category: AdminCategory;
  categories: AdminCategory[];
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const parent = categories.find((item) => item.id === category.parent_id);

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateAdminCategory>[1]) =>
      updateAdminCategory(category.id, payload),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminCategory(category.id),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Не удалось удалить"),
  });

  return (
    <tr className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900">
      <td className="px-3 py-2">{category.name}</td>
      <td className="px-3 py-2 font-mono text-xs text-zinc-500">{category.slug}</td>
      <td className="px-3 py-2 text-zinc-500">{parent?.name ?? "—"}</td>
      <td className="px-3 py-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={category.is_active}
            onChange={(event) => updateMutation.mutate({ is_active: event.target.checked })}
          />
          активна
        </label>
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:border-red-400 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
        >
          Удалить
        </button>
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </td>
    </tr>
  );
}

function CreateCategoryForm({ categories }: { categories: AdminCategory[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [parentId, setParentId] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createAdminCategory({
        name,
        slug,
        parent_id: parentId || null,
        sort_order: 0,
      }),
    onSuccess: () => {
      setName("");
      setSlug("");
      setSlugTouched(false);
      setParentId("");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Название</label>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugTouched) setSlug(slugify(event.target.value));
          }}
          required
          className="w-48 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Слаг</label>
        <input
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value);
            setSlugTouched(true);
          }}
          required
          className="w-40 rounded border border-zinc-300 px-2 py-1 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Родительская категория</label>
        <select
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">— нет —</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {mutation.isPending ? "Создание…" : "Создать категорию"}
      </button>
      {mutation.isError && (
        <p className="w-full text-sm text-red-600 dark:text-red-400">
          {mutation.error instanceof ApiError ? mutation.error.message : "Не удалось создать"}
        </p>
      )}
    </form>
  );
}

export default function AdminCategoriesPage() {
  const role = useAuthStore((state) => state.role);
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listAdminCategories(1, 100),
    enabled: role === "admin",
  });

  if (role !== "admin") {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Категории</h1>
        <p className="text-zinc-500">
          Управление категориями доступно только роли «admin» (ТЗ 6.4).
        </p>
      </div>
    );
  }

  const categories = data?.items ?? [];

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Категории</h1>
      <CreateCategoryForm categories={categories} />
      {isLoading && <p className="text-zinc-500">Загрузка…</p>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-3 py-2">Название</th>
                <th className="px-3 py-2">Слаг</th>
                <th className="px-3 py-2">Родитель</th>
                <th className="px-3 py-2">Активна</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <CategoryRow key={category.id} category={category} categories={categories} />
              ))}
            </tbody>
          </table>
          {categories.length === 0 && (
            <p className="p-4 text-center text-zinc-500">Категорий пока нет</p>
          )}
        </div>
      )}
    </div>
  );
}
