"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Plus, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import {
  createAdminCategory,
  deleteAdminCategory,
  listAdminCategories,
  replaceAdminCategoryImage,
  updateAdminCategory,
  type AdminCategory,
} from "@/entities/category/adminApi";
import { useToastStore } from "@/entities/toast/store";
import { ApiError } from "@/shared/api/client";
import { slugify } from "@/shared/lib/slugify";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { Drawer } from "@/shared/ui/Drawer";
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
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  onAddSubcategory,
}: {
  category: FlatCategory;
  onDragStart: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
  onAddSubcategory: (parentId: string) => void;
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

  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageMutation = useMutation({
    mutationFn: (file: File) => replaceAdminCategoryImage(category.id, file),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err: unknown) =>
      pushToast(err instanceof ApiError ? err.message : "Не удалось загрузить фото", "error"),
  });

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
      <div
        draggable={!editing}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`group flex items-center gap-2.5 border-b border-surface px-4 py-2 last:border-0 ${
          isDragging ? "bg-brand-soft" : "hover:bg-surface/60"
        }`}
        style={{ paddingLeft: `${16 + category.depth * 28}px`, opacity: category.is_active ? 1 : 0.55 }}
      >
        <span
          aria-hidden="true"
          className="cursor-grab text-[13px] tracking-[-1px] text-ink-muted/50"
        >
          ⠿
        </span>
        <button
          type="button"
          title="Фото для плитки категории на главной"
          onClick={() => imageInputRef.current?.click()}
          disabled={imageMutation.isPending}
          className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface disabled:opacity-50"
        >
          {category.thumbnail_url ? (
            <Image
              src={category.thumbnail_url}
              alt=""
              fill
              unoptimized
              sizes="28px"
              className="object-cover"
            />
          ) : (
            <ImagePlus className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
          )}
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) imageMutation.mutate(file);
            event.target.value = "";
          }}
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
            className="animate-cell-edit-in h-[30px] flex-1 rounded-lg border border-brand bg-bg px-2.5 text-[13px] font-medium text-ink outline-none ring-2 ring-brand-soft"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={startEditing}
            title="Двойной клик — переименовать"
            className={`flex-1 truncate text-left text-[13px] text-ink ${category.parent_id === null ? "font-semibold" : "font-normal"}`}
          >
            {category.name}
          </button>
        )}
        <span className="whitespace-nowrap font-mono text-[11px] text-ink-muted">
          {category.product_count} тов.
        </span>
        <Toggle
          checked={category.is_active}
          disabled={updateMutation.isPending}
          onChange={(checked) => updateMutation.mutate({ is_active: checked })}
          label={`Категория ${category.is_active ? "активна" : "скрыта"}: ${category.name}`}
        />
        <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title="Добавить подкатегорию"
            onClick={() => onAddSubcategory(category.id)}
            className="flex h-6 w-6 items-center justify-center rounded-md bg-surface text-ink hover:bg-border/60"
          >
            <Plus className="h-2.5 w-2.5" aria-hidden="true" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            title="Удалить"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteMutation.isPending}
            aria-label={`Удалить «${category.name}»`}
            className="flex h-6 w-6 items-center justify-center rounded-md bg-surface text-accent-sale hover:bg-accent-sale/10 disabled:opacity-50"
          >
            <X className="h-2.5 w-2.5" aria-hidden="true" strokeWidth={2.5} />
          </button>
        </span>
      </div>
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

function CategoriesTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg" aria-busy="true" aria-label="Загрузка категорий">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5 border-b border-surface px-4 py-2 last:border-0">
          <span className="text-[13px] tracking-[-1px] text-ink-muted/20" aria-hidden="true">
            ⠿
          </span>
          <div className="h-7 w-7 shrink-0 animate-pulse rounded-md bg-surface" />
          <div className="h-3.5 flex-1 animate-pulse rounded bg-surface" style={{ maxWidth: `${60 - (i % 3) * 12}%` }} />
          <div className="h-3 w-10 shrink-0 animate-pulse rounded bg-surface" />
          <div className="h-5 w-9 shrink-0 animate-pulse rounded-full bg-surface" />
        </div>
      ))}
    </div>
  );
}

function CreateCategoryDrawer({
  open,
  onClose,
  categories,
  initialParentId,
}: {
  open: boolean;
  onClose: () => void;
  categories: AdminCategory[];
  initialParentId: string | null;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [parentId, setParentId] = useState(initialParentId ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      createAdminCategory({
        name,
        slug,
        parent_id: parentId || null,
        sort_order: 0,
      }),
    onSuccess: () => {
      pushToast(`Категория «${name}» создана`);
      setName("");
      setSlug("");
      setSlugTouched(false);
      setParentId("");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
    onError: (err: unknown) =>
      pushToast(err instanceof ApiError ? err.message : "Не удалось создать", "error"),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={460}
      title={<span className="font-display text-base font-extrabold text-ink">Новая категория</span>}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          Название
          <input
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTouched) setSlug(slugify(event.target.value));
            }}
            required
            className="h-10 rounded-lg border border-border bg-bg px-3 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          Слаг
          <input
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugTouched(true);
            }}
            required
            className="h-10 rounded-lg border border-border bg-bg px-3 font-mono text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          Родительская категория
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            className="h-10 rounded-lg border border-border bg-bg px-3 text-sm text-ink outline-none focus:border-brand"
          >
            <option value="">— нет —</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        {mutation.isError && (
          <p className="text-sm text-accent-sale-700">
            {mutation.error instanceof ApiError ? mutation.error.message : "Не удалось создать"}
          </p>
        )}

        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex-1 rounded-lg bg-brand px-4 py-2.5 font-display text-[13px] font-bold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {mutation.isPending ? "Создание…" : "Создать"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface px-4 py-2.5 font-display text-[13px] font-semibold text-ink hover:bg-border/60"
          >
            Отмена
          </button>
        </div>
      </form>
    </Drawer>
  );
}

export default function AdminCategoriesPage() {
  const role = useAuthStore((state) => state.role);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerParentId, setDrawerParentId] = useState<string | null>(null);
  // No page control here on purpose: this renders as one drag-reorderable
  // tree (flattenTree below), and paging a flat page/page_size slice would
  // cut parents away from their children mid-tree. 100 (the backend's max
  // page_size) is already far more than a curated category tree needs --
  // unlike products/orders/users this list doesn't grow with store traffic.
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

  function openCreateDrawer(parentId: string | null) {
    setDrawerParentId(parentId);
    setDrawerOpen(true);
  }

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
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[20px] font-extrabold text-ink">Категории</h1>
        <button
          type="button"
          onClick={() => openCreateDrawer(null)}
          className="rounded-lg bg-brand px-4 py-2 font-display text-[13px] font-bold text-white hover:bg-brand/90"
        >
          + Добавить категорию
        </button>
      </div>

      {isLoading && (
        <div className="grid items-start gap-3.5" style={{ gridTemplateColumns: "640px 1fr" }}>
          <CategoriesTableSkeleton />
        </div>
      )}

      {data && (
        <div className="grid animate-content-fade-in items-start gap-3.5" style={{ gridTemplateColumns: "640px 1fr" }}>
          <div className="overflow-hidden rounded-xl border border-border bg-bg">
            {flat.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                isDragging={dragId === category.id}
                onDragStart={() => setDragId(category.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(category.id)}
                onAddSubcategory={openCreateDrawer}
              />
            ))}
            {categories.length === 0 && (
              <p className="p-4 text-center text-ink-muted">Категорий пока нет</p>
            )}
          </div>

          <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-bg p-4 text-xs leading-[1.6] text-ink-muted">
            <span className="font-display text-[13px] font-bold text-ink">Как работает</span>
            <span>
              ⠿ — перетащить: порядок среди категорий одного уровня меняется сразу. Двойной клик по
              названию — переименовать.
            </span>
            <span>
              Тумблер выключает категорию с витрины, товары не удаляются. Удаление категории с
              товарами или подкатегориями будет отклонено сервером.
            </span>
          </div>
        </div>
      )}

      <CreateCategoryDrawer
        key={drawerParentId ?? "none"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        categories={categories}
        initialParentId={drawerParentId}
      />
    </div>
  );
}
