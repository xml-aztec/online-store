"use client";

import { Plus, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listAdminCategories } from "@/entities/category/adminApi";
import {
  createAdminVariant,
  deleteAdminProduct,
  deleteAdminProductImage,
  deleteAdminVariant,
  getAdminProduct,
  reorderAdminProductImages,
  updateAdminProduct,
  updateAdminVariant,
  uploadAdminProductImage,
  type AdminProductDetail,
  type AdminProductImage,
  type AdminProductVariant,
} from "@/entities/product/adminApi";
import { ApiError } from "@/shared/api/client";
import { isColorFacet, swatchStyle } from "@/shared/lib/colorSwatches";
import { Toggle } from "@/shared/ui/Toggle";

type Tab = "basic" | "variants" | "images";

const INPUT_CLASS =
  "w-full rounded-lg border border-ink/15 bg-bg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-ink-muted";

function optionsToString(options: Record<string, unknown>): string {
  return Object.entries(options)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("; ");
}

function parseOptions(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of input.split(";")) {
    const [key, value] = pair.split("=").map((part) => part.trim());
    if (key && value) result[key] = value;
  }
  return result;
}

function attributesToEntries(attributes: Record<string, unknown>): [string, string][] {
  const entries = Object.entries(attributes).map(
    ([key, value]) => [key, String(value)] as [string, string]
  );
  return entries.length > 0 ? entries : [["", ""]];
}

function BasicTab({ product }: { product: AdminProductDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: categoriesData } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => listAdminCategories(1, 100),
  });
  const [name, setName] = useState(product.name);
  const [slug, setSlug] = useState(product.slug);
  const [categoryId, setCategoryId] = useState(product.category_id);
  const [description, setDescription] = useState(product.description ?? "");
  const [isActive, setIsActive] = useState(product.is_active);
  const [attrEntries, setAttrEntries] = useState<[string, string][]>(() =>
    attributesToEntries(product.attributes)
  );
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAdminProduct(product.id, {
        name,
        slug,
        category_id: categoryId,
        description: description || null,
        is_active: isActive,
        attributes: Object.fromEntries(
          attrEntries.filter(([key]) => key.trim().length > 0)
        ),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-product", product.id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminProduct(product.id),
    onSuccess: () => router.push("/admin/products"),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    saveMutation.mutate();
  }

  function updateAttrEntry(index: number, next: [string, string]) {
    setAttrEntries((prev) => prev.map((entry, i) => (i === index ? next : entry)));
  }

  function removeAttrEntry(index: number) {
    setAttrEntries((prev) => prev.filter((_, i) => i !== index));
  }

  const categories = categoriesData?.items ?? [];

  return (
    <form id="basic-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={LABEL_CLASS}>Название</label>
        <input value={name} onChange={(event) => setName(event.target.value)} className={INPUT_CLASS} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>Категория</label>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className={INPUT_CLASS}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>Слаг</label>
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            className={`${INPUT_CLASS} font-mono`}
          />
        </div>
      </div>
      <div>
        <label className={LABEL_CLASS}>Описание</label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className={`${INPUT_CLASS} resize-y`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className={LABEL_CLASS}>Характеристики</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {attrEntries.map(([key, value], index) => (
            <div key={index} className="flex gap-2">
              <input
                value={key}
                onChange={(event) => updateAttrEntry(index, [event.target.value, value])}
                placeholder="Название"
                className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-bg px-2.5 py-2 text-sm outline-none focus:border-brand"
              />
              <input
                value={value}
                onChange={(event) => updateAttrEntry(index, [key, event.target.value])}
                placeholder="Значение"
                className="w-24 rounded-lg border border-ink/15 bg-bg px-2.5 py-2 font-mono text-sm outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => removeAttrEntry(index)}
                aria-label="Удалить характеристику"
                className="shrink-0 rounded-lg p-2 text-ink-muted hover:bg-surface hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAttrEntries((prev) => [...prev, ["", ""]])}
          className="flex w-fit items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand/80"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Добавить характеристику
        </button>
      </div>

      <label className="flex w-fit items-center gap-2.5 text-sm text-ink">
        <Toggle checked={isActive} onChange={setIsActive} label="Товар активен" />
        Товар активен
      </label>

      {saveMutation.isError && (
        <p className="text-sm text-accent-sale-700">
          {saveMutation.error instanceof ApiError
            ? saveMutation.error.message
            : "Не удалось сохранить"}
        </p>
      )}
      {saved && <p className="text-sm font-medium text-success-700">Сохранено ✓</p>}

      <div className="mt-2 border-t border-ink/10 pt-4">
        <button
          type="button"
          onClick={() => {
            if (confirm("Удалить товар? Это действие нельзя отменить.")) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
          className="rounded-lg border border-accent-sale/40 px-4 py-2 text-sm font-medium text-accent-sale-700 hover:border-accent-sale/60 disabled:opacity-50"
        >
          Удалить товар
        </button>
      </div>
    </form>
  );
}

function VariantRow({ productId, variant }: { productId: string; variant: AdminProductVariant }) {
  const queryClient = useQueryClient();
  const [price, setPrice] = useState(variant.price);
  const [stockQty, setStockQty] = useState(String(variant.stock_qty));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colorEntry = Object.entries(variant.options).find(([key]) => isColorFacet(key));

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAdminVariant(productId, variant.id, { price, stock_qty: Number(stockQty) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-product", productId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminVariant(productId, variant.id),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-product", productId] });
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Не удалось удалить вариант"),
  });

  return (
    <tr className="border-b border-ink/5 text-sm last:border-0">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {colorEntry && (
            <span
              aria-hidden="true"
              style={swatchStyle(String(colorEntry[1]))}
              className="h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-ink/15"
            />
          )}
          {optionsToString(variant.options) || "—"}
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">{variant.sku}</td>
      <td className="px-3 py-2.5">
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className="w-24 rounded-lg border border-ink/15 bg-bg px-2 py-1.5 text-right font-mono text-sm outline-none focus:border-brand"
        />
      </td>
      <td className="px-3 py-2.5">
        <input
          value={stockQty}
          onChange={(event) => setStockQty(event.target.value)}
          className="w-20 rounded-lg border border-ink/15 bg-bg px-2 py-1.5 text-right font-mono text-sm outline-none focus:border-brand"
        />
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="rounded-lg border border-ink/15 px-2.5 py-1 text-xs font-semibold hover:border-brand/40 disabled:opacity-50"
          >
            {saveMutation.isPending ? "…" : saved ? "Сохранено ✓" : "Сохранить"}
          </button>
          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            aria-label="Удалить вариант"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-accent-sale/10 hover:text-accent-sale-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-accent-sale-700">{error}</p>}
      </td>
    </tr>
  );
}

function VariantsTab({ product }: { product: AdminProductDetail }) {
  const queryClient = useQueryClient();
  const [sku, setSku] = useState("");
  const [options, setOptions] = useState("");
  const [price, setPrice] = useState("");
  const [stockQty, setStockQty] = useState("0");

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminVariant(product.id, {
        sku,
        options: parseOptions(options),
        price,
        stock_qty: Number(stockQty),
      }),
    onSuccess: () => {
      setSku("");
      setOptions("");
      setPrice("");
      setStockQty("0");
      void queryClient.invalidateQueries({ queryKey: ["admin-product", product.id] });
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-ink/10">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ink/10 bg-surface text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              <th className="px-3 py-2">Опция</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2 text-right">Цена</th>
              <th className="px-3 py-2 text-right">Остаток</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {product.variants.map((variant) => (
              <VariantRow key={variant.id} productId={product.id} variant={variant} />
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-surface p-4"
      >
        <div>
          <label className={LABEL_CLASS}>SKU</label>
          <input
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            required
            className="w-32 rounded-lg border border-ink/15 bg-bg px-2.5 py-2 font-mono text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Опции (цвет=красный; объём=1л)</label>
          <input
            value={options}
            onChange={(event) => setOptions(event.target.value)}
            className="w-56 rounded-lg border border-ink/15 bg-bg px-2.5 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Цена</label>
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            required
            className="w-24 rounded-lg border border-ink/15 bg-bg px-2.5 py-2 font-mono text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Остаток</label>
          <input
            value={stockQty}
            onChange={(event) => setStockQty(event.target.value)}
            className="w-20 rounded-lg border border-ink/15 bg-bg px-2.5 py-2 font-mono text-sm outline-none focus:border-brand"
          />
        </div>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/85 disabled:opacity-50"
        >
          {createMutation.isPending ? "Создание…" : "+ Добавить вариант"}
        </button>
        {createMutation.isError && (
          <p className="w-full text-sm text-accent-sale-700">
            {createMutation.error instanceof ApiError
              ? createMutation.error.message
              : "Не удалось добавить вариант"}
          </p>
        )}
      </form>
    </div>
  );
}

function ImageTile({
  productId,
  image,
  isPrimary,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}: {
  productId: string;
  image: AdminProductImage;
  isPrimary: boolean;
  onDragStart: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
}) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminProductImage(productId, image.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-product", productId] }),
  });

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`relative aspect-square cursor-move overflow-hidden rounded-lg border bg-surface ${
        isDragging ? "border-brand" : "border-ink/10"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, next/image optimization is pointless here (see Задача 2.3) */}
      <img src={image.thumbnail_url} alt={image.alt ?? ""} className="h-full w-full object-cover" />
      {isPrimary && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-brand px-1.5 py-0.5 font-display text-[10px] font-bold text-white">
          Главное
        </span>
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-md bg-bg text-xs text-ink-muted"
      >
        ⠿
      </span>
      <button
        type="button"
        onClick={() => deleteMutation.mutate()}
        disabled={deleteMutation.isPending}
        className="absolute right-1.5 top-1.5 rounded-md bg-ink/70 px-1.5 py-1 text-[10px] font-semibold text-white hover:bg-ink disabled:opacity-50"
      >
        Удалить
      </button>
    </div>
  );
}

function ImagesTab({ product }: { product: AdminProductDetail }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const images = [...product.images].sort((a, b) => a.sort_order - b.sort_order);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAdminProductImage(product.id, file),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-product", product.id] });
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить фото"),
  });

  const reorderMutation = useMutation({
    mutationFn: (imageIds: string[]) => reorderAdminProductImages(product.id, imageIds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-product", product.id] }),
  });

  function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) return;
    const reordered = [...images];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    setDragIndex(null);
    reorderMutation.mutate(reordered.map((image) => image.id));
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((image, index) => (
          <ImageTile
            key={image.id}
            productId={product.id}
            image={image}
            isPrimary={index === 0}
            isDragging={dragIndex === index}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDrop(index)}
          />
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-ink/20 text-ink-muted hover:border-brand hover:text-brand disabled:opacity-50"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          <span className="text-xs font-semibold">
            {uploadMutation.isPending ? "Загрузка…" : "Добавить"}
          </span>
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) uploadMutation.mutate(file);
          event.target.value = "";
        }}
        className="hidden"
      />
      <p className="mt-3 text-xs text-ink-muted">
        Перетащите превью, чтобы изменить порядок — первое изображение становится главным.
      </p>
      {error && <p className="mt-2 text-sm text-accent-sale-700">{error}</p>}
    </div>
  );
}

export default function AdminProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const [tab, setTab] = useState<Tab>("basic");

  const { data: product, isLoading } = useQuery({
    queryKey: ["admin-product", productId],
    queryFn: () => getAdminProduct(productId),
  });

  if (isLoading || !product) {
    return <p className="text-ink-muted">Загрузка…</p>;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "basic", label: "Основное" },
    { key: "variants", label: `Варианты (${product.variants.length})` },
    { key: "images", label: `Изображения (${product.images.length})` },
  ];

  return (
    <div className="max-w-3xl rounded-2xl bg-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-ink-muted">Товары / редактирование</p>
          <p className="font-display text-lg font-extrabold text-ink">{product.name}</p>
        </div>
        {tab === "basic" && (
          <button
            type="submit"
            form="basic-form"
            className="shrink-0 rounded-lg bg-brand px-5 py-2 font-display text-sm font-bold text-white hover:bg-brand/90"
          >
            Сохранить
          </button>
        )}
      </div>

      <div className="mb-5 flex gap-1 border-b border-ink/10">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`border-b-2 px-3.5 py-2.5 font-display text-[13px] font-bold transition ${
              tab === item.key
                ? "border-brand text-brand"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-ink/10 bg-bg p-5">
        {tab === "basic" && <BasicTab product={product} />}
        {tab === "variants" && <VariantsTab product={product} />}
        {tab === "images" && <ImagesTab product={product} />}
      </div>
    </div>
  );
}
