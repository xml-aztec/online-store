"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import {
  createAdminCategory,
  deleteAdminCategory,
  listAdminCategories,
  updateAdminCategory,
  type AdminCategory,
} from "@/entities/category/adminApi";
import { useToastStore } from "@/entities/toast/store";
import { ApiError } from "@/shared/api/client";
import { slugify } from "@/shared/lib/slugify";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
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
  const pushToast = useToastStore((state) => state.push);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(category.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateAdminCategory>[1]) =>
      updateAdminCategory(category.id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) =>
      pushToast(err instanceof ApiError ? err.message : "Не удалось сохранить", "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminCategory(category.id),
    onSuccess: () => {
      setConfirmDelete(false);
      pushToast(`Категория «${category.name}» удалена`);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => {
      setConfirmDelete(false);
      pushToast(err instanceof ApiError ? err.message : "Не удалось удалить", "error");
    },
  });

  const childCount = categories.filter((c) => c.parent_id === category.id).length;

  function startEditing() {
    setDraftName(category.name);
    setEditing(true);
  }

  function commitRename() {
    const trimmed = draftName.trim();
    setEditing(false);
    if (!trimmed || trimmed === category.name) return;
    updateMutation.mutate({ name: trimmed });
  }

  return (
    <>
      <tr
        draggable={!editing}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`group border-b border-border/60 align-top text-sm last:border-0 ${
          isDragging ? "bg-brand-soft/40" : "hover:bg-surface"
        } ${category.is_active ? "" : "opacity-55"}`}
      >
        <td
          className={`px-3 py-2.5 ${editing ? "cursor-default" : "cursor-move"}`}
          style={{ paddingLeft: `${12 + category.depth * 24}px` }}
        >
          <div className="flex items-center gap-2">
            <GripVertical
              className="h-3.5 w-3.5 shrink-0 text-ink-muted/60"
              aria-hidden="true"
            />
            {editing ? (
              <input
                autoFocus
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") {
                    setDraftName(category.name);
                    setEditing(false);
                  }
                }}
                className="w-full min-w-0 rounded-md border border-brand bg-bg px-1.5 py-0.5 text-sm text-ink outline-none"
              />
            ) : (
              <button
                type="button"
                onDoubleClick={startEditing}
                title="Двойной клик — переименовать"
                className="truncate text-left text-ink"
              >
                {category.name}
              </button>
            )}
            {!editing && (
              <button
                type="button"
                onClick={startEditing}
                aria-label={`Переименовать «${category.name}»`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-muted opacity-0 hover:bg-border/60 hover:text-ink group-hover:opacity-100"
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">{category.slug}</td>
        <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">
          {childCount > 0 ? `${childCount} подкат.` : "—"}
        </td>
        <td className="px-3 py-2.5">
          <Toggle
            checked={category.is_active}
            disabled={updateMutation.isPending}
            onChange={(checked) => updateMutation.mutate({ is_active: checked })}
            label={`Категория ${category.is_active ? "активна" : "скрыта"}: ${category.name}`}
          />
        </td>
        <td className="px-3 py-2.5 text-right">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteMutation.isPending}
            aria-label={`Удалить «${category.name}»`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted opacity-0 hover:bg-accent-sale/10 hover:text-accent-sale-700 disabled:opacity-50 group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </td>
      </tr>
      <ConfirmDialog
        open={confirmDelete}
        title="Удалить категорию?"
        description={
          <>
            Категория «{category.name}» будет удалена без возможности восстановления. Если в ней
            остались товары или подкатегории, удаление будет отклонено сервером.
          </>
        }
        confirmLabel={deleteMutation.isPending ? "Удаление…" : "Удалить"}
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

function CreateCategoryForm({ categories }: { categories: AdminCategory[] }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      pushToast("Категория создана");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) =>
      pushToast(err instanceof ApiError ? err.message : "Не удалось создать", "error"),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3.5 py-2 font-display text-[13px] font-semibold text-ink hover:border-brand/40"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Добавить категорию
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Название</label>
        <input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugTouched) setSlug(slugify(event.target.value));
          }}
          required
          className="w-48 rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
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
          className="w-40 rounded-lg border border-border bg-bg px-2 py-1.5 font-mono text-sm text-ink outline-none focus:border-brand"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Родительская категория</label>
        <select
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          className="rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
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
        className="rounded-lg bg-brand px-4 py-2 font-display text-[13px] font-bold text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {mutation.isPending ? "Создание…" : "Создать"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-lg px-3 py-2 font-display text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        Отмена
      </button>
    </form>
  );
}

export default function AdminCategoriesPage() {
  const role = useAuthStore((state) => state.role);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
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
    onError: (err: unknown) =>
      pushToast(err instanceof ApiError ? err.message : "Не удалось сохранить порядок", "error"),
  });

  if (role !== "admin") {
    return (
      <div>
        <h1 className="mb-6 font-display text-[22px] font-extrabold text-ink">Категории</h1>
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[22px] font-extrabold text-ink">
          Категории <span className="font-mono text-base font-normal text-ink-muted">{categories.length}</span>
        </h1>
      </div>
      <CreateCategoryForm categories={categories} />
      <p className="-mt-2 text-xs text-ink-muted">
        Перетаскивание за <GripVertical className="inline h-3 w-3 -translate-y-px" aria-hidden="true" /> меняет
        порядок среди категорий одного уровня; двойной клик по названию — переименовать; выключенная
        категория скрывается из каталога, товары остаются.
      </p>
      {isLoading && <p className="text-ink-muted">Загрузка…</p>}
      {data && (
        <div className="overflow-hidden rounded-xl border border-border bg-bg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
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
