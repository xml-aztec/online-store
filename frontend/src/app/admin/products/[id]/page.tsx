"use client";

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

type Tab = "basic" | "variants" | "images";

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
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAdminProduct(product.id, {
        name,
        slug,
        category_id: categoryId,
        description: description || null,
        is_active: isActive,
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

  const categories = categoriesData?.items ?? [];

  return (
    <div>
      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">Название</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">Слаг</label>
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">Категория</label>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">Описание</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Товар активен
        </label>
        {saveMutation.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {saveMutation.error instanceof ApiError
              ? saveMutation.error.message
              : "Не удалось сохранить"}
          </p>
        )}
        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saveMutation.isPending ? "Сохраняем…" : saved ? "Сохранено ✓" : "Сохранить"}
        </button>
      </form>

      <div className="mt-8 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => {
            if (confirm("Удалить товар? Это действие нельзя отменить.")) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
          className="rounded border border-red-300 px-4 py-2 text-sm text-red-600 hover:border-red-400 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
        >
          Удалить товар
        </button>
      </div>
    </div>
  );
}

function VariantRow({ productId, variant }: { productId: string; variant: AdminProductVariant }) {
  const queryClient = useQueryClient();
  const [price, setPrice] = useState(variant.price);
  const [stockQty, setStockQty] = useState(String(variant.stock_qty));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
      <td className="px-3 py-2">{variant.sku}</td>
      <td className="px-3 py-2">{optionsToString(variant.options)}</td>
      <td className="px-3 py-2">
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={stockQty}
          onChange={(event) => setStockQty(event.target.value)}
          className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="rounded border border-zinc-300 px-2 py-1 text-xs hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700"
        >
          {saveMutation.isPending ? "…" : saved ? "Сохранено ✓" : "Сохранить"}
        </button>
      </td>
      <td className="px-3 py-2">
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
      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
            <th className="px-3 py-1">SKU</th>
            <th className="px-3 py-1">Опции</th>
            <th className="px-3 py-1">Цена</th>
            <th className="px-3 py-1">Остаток</th>
            <th className="px-3 py-1" />
            <th className="px-3 py-1" />
          </tr>
        </thead>
        <tbody>
          {product.variants.map((variant) => (
            <VariantRow key={variant.id} productId={product.id} variant={variant} />
          ))}
        </tbody>
      </table>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div>
          <label className="mb-1 block text-xs text-zinc-500">SKU</label>
          <input
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            required
            className="w-32 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Опции (цвет=красный; объём=1л)</label>
          <input
            value={options}
            onChange={(event) => setOptions(event.target.value)}
            className="w-56 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Цена</label>
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            required
            className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Остаток</label>
          <input
            value={stockQty}
            onChange={(event) => setStockQty(event.target.value)}
            className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {createMutation.isPending ? "Создание…" : "Добавить вариант"}
        </button>
        {createMutation.isError && (
          <p className="w-full text-sm text-red-600 dark:text-red-400">
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
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}: {
  productId: string;
  image: AdminProductImage;
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
      className={`relative aspect-square cursor-move overflow-hidden rounded-lg border ${
        isDragging ? "border-zinc-900 dark:border-zinc-100" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, next/image optimization is pointless here (see Задача 2.3) */}
      <img src={image.thumbnail_url} alt={image.alt ?? ""} className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={() => deleteMutation.mutate()}
        disabled={deleteMutation.isPending}
        className="absolute right-1 top-1 rounded bg-black/60 px-2 py-1 text-xs text-white disabled:opacity-50"
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
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {images.map((image, index) => (
          <ImageTile
            key={image.id}
            productId={product.id}
            image={image}
            isDragging={dragIndex === index}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDrop(index)}
          />
        ))}
      </div>
      {images.length === 0 && <p className="mb-4 text-zinc-500">Фотографий пока нет</p>}
      <p className="mb-2 text-xs text-zinc-500">
        Перетаскивайте фото, чтобы изменить порядок отображения.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) uploadMutation.mutate(file);
          event.target.value = "";
        }}
        className="text-sm text-zinc-700 dark:text-zinc-300"
      />
      {(uploadMutation.isPending || reorderMutation.isPending) && (
        <p className="mt-2 text-sm text-zinc-500">Загрузка…</p>
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
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
    return <p className="text-zinc-500">Загрузка…</p>;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "basic", label: "Основное" },
    { key: "variants", label: `Варианты (${product.variants.length})` },
    { key: "images", label: `Изображения (${product.images.length})` },
  ];

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        {product.name}
      </h1>
      <div className="mb-6 flex gap-4 border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`border-b-2 px-1 pb-2 text-sm font-medium ${
              tab === item.key
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "basic" && <BasicTab product={product} />}
      {tab === "variants" && <VariantsTab product={product} />}
      {tab === "images" && <ImagesTab product={product} />}
    </div>
  );
}
