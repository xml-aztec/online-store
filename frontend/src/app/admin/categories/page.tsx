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
import { Toggle } from "@/shared/ui/Toggle";

const QUERY_KEY = ["admin-categories"];

interface FlatCategory extends AdminCategory {
  depth: number;
}

// Depth-first flatten, siblings ordered by sort_order -- gives the indented
// "tree read top to bottom" list the admin mockup shows, and is also the
// order drag-and-drop reorders within (see handleDrop below).
function flattenTree(categories: AdminCategory[]): FlatCategory[] {
  const byParent = new Map<string | null, AdminCategory[]>();
  for (const category of categories) {
    const key = category.parent_id ?? null;
    const siblings = byParent.get(key) ?? [];
    siblings.push(category);
    byParent.set(key, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.sort_order - b.sort_order);
  }

  const result: FlatCategory[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const category of byParent.get(parentId) ?? []) {
      result.push({ ...category, depth });
      visit(category.id, depth + 1);
    }
  }
  visit(null, 0);
  return result;
}

function CategoryRow({
  category,
  categories,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}: {
  category: FlatCategory;
  categories: AdminCategory[];
  onDragStart: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

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

  const productCount = categories.filter((c) => c.parent_id === category.id).length;

  return (
    <tr
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`cursor-move border-b border-ink/10 align-top last:border-0 ${
        isDragging ? "bg-brand/5" : ""
      } ${category.is_active ? "" : "opacity-55"}`}
    >
      <td className="px-3 py-2" style={{ paddingLeft: `${12 + category.depth * 24}px` }}>
        <span className="mr-2 text-ink-muted" aria-hidden="true">
          ⠿
        </span>
        {category.name}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-ink-muted">{category.slug}</td>
      <td className="px-3 py-2 font-mono text-xs text-ink-muted">
        {productCount > 0 ? `${productCount} подкат.` : "—"}
      </td>
      <td className="px-3 py-2">
        <Toggle
          checked={category.is_active}
          disabled={updateMutation.isPending}
          onChange={(checked) => updateMutation.mutate({ is_active: checked })}
          label={`Категория ${category.is_active ? "активна" : "скрыта"}: ${category.name}`}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          className="rounded-lg border border-accent-sale/40 px-2 py-1 text-xs text-accent-sale-700 hover:border-accent-sale/60 disabled:opacity-50"
        >
          Удалить
        </button>
        {error && <p className="mt-1 text-xs text-accent-sale-700">{error}</p>}
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
      className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-ink/10 p-4"
    >
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Название</label>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugTouched) setSlug(slugify(event.target.value));
          }}
          required
          className="w-48 rounded-lg border border-ink/15 px-2 py-1 text-sm bg-bg"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Слаг</label>
        <input
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value);
            setSlugTouched(true);
          }}
          required
          className="w-40 rounded-lg border border-ink/15 px-2 py-1 text-sm font-mono bg-bg"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Родительская категория</label>
        <select
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          className="rounded-lg border border-ink/15 px-2 py-1 text-sm bg-bg"
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
        className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {mutation.isPending ? "Создание…" : "Создать категорию"}
      </button>
      {mutation.isError && (
        <p className="w-full text-sm text-accent-sale-700">
          {mutation.error instanceof ApiError ? mutation.error.message : "Не удалось создать"}
        </p>
      )}
    </form>
  );
}

export default function AdminCategoriesPage() {
  const role = useAuthStore((state) => state.role);
  const queryClient = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listAdminCategories(1, 100),
    enabled: role === "admin",
  });

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      // No bulk-reorder endpoint (unlike product images) -- categories change
      // order rarely enough that sequential PATCHes are fine for this
      // low-concurrency internal tool.
      for (const update of updates) {
        await updateAdminCategory(update.id, { sort_order: update.sort_order });
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  if (role !== "admin") {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-ink">Категории</h1>
        <p className="text-ink-muted">
          Управление категориями доступно только роли «admin» (ТЗ 6.4).
        </p>
      </div>
    );
  }

  const categories = data?.items ?? [];
  const flat = flattenTree(categories);

  function handleDrop(dropId: string) {
    if (!dragId || dragId === dropId) {
      setDragId(null);
      return;
    }
    const dragged = categories.find((c) => c.id === dragId);
    const target = categories.find((c) => c.id === dropId);
    setDragId(null);
    // Only reorder within the same parent -- moving a category to a
    // different parent is a separate action (not modeled here) to avoid
    // silently changing the tree shape via a drag.
    if (!dragged || !target || dragged.parent_id !== target.parent_id) return;

    const siblings = categories
      .filter((c) => c.parent_id === dragged.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const fromIndex = siblings.findIndex((c) => c.id === dragId);
    const toIndex = siblings.findIndex((c) => c.id === dropId);
    const reordered = [...siblings];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    reorderMutation.mutate(reordered.map((c, index) => ({ id: c.id, sort_order: index })));
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-ink">Категории</h1>
      <CreateCategoryForm categories={categories} />
      <p className="mb-3 text-xs text-ink-muted">
        Перетаскивание за ⠿ меняет порядок среди категорий одного уровня; выключенная категория
        скрывается из каталога, товары остаются.
      </p>
      {isLoading && <p className="text-ink-muted">Загрузка…</p>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-surface text-left text-ink-muted">
                <th className="px-3 py-2">Название</th>
                <th className="px-3 py-2">Слаг</th>
                <th className="px-3 py-2">Подкатегории</th>
                <th className="px-3 py-2">Активна</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {flat.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  categories={categories}
                  isDragging={dragId === category.id}
                  onDragStart={() => setDragId(category.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(category.id)}
                />
              ))}
            </tbody>
          </table>
          {categories.length === 0 && (
            <p className="p-4 text-center text-ink-muted">Категорий пока нет</p>
          )}
        </div>
      )}
    </div>
  );
}
