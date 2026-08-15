"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { listAdminCategories } from "@/entities/category/adminApi";
import {
  createAdminProduct,
  createAdminVariant,
  uploadAdminProductImage,
  type AdminProductDetail,
} from "@/entities/product/adminApi";
import { useToastStore } from "@/entities/toast/store";
import { ApiError } from "@/shared/api/client";
import { parseOptions } from "@/shared/lib/productOptions";
import { slugify } from "@/shared/lib/slugify";

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-bg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-ink-muted";
const SECTION_CLASS = "flex flex-col gap-4 rounded-xl border border-border bg-bg p-5";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
}

function AttributeRows({
  entries,
  onChange,
}: {
  entries: [string, string][];
  onChange: (entries: [string, string][]) => void;
}) {
  function update(index: number, entry: [string, string]) {
    const next = [...entries];
    next[index] = entry;
    onChange(next);
  }
  function remove(index: number) {
    onChange(entries.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL_CLASS}>Характеристики</span>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {entries.map(([key, value], index) => (
          <div key={index} className="flex gap-2">
            <input
              value={key}
              onChange={(event) => update(index, [event.target.value, value])}
              placeholder="Название"
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-ink outline-none focus:border-brand"
            />
            <input
              value={value}
              onChange={(event) => update(index, [key, event.target.value])}
              placeholder="Значение"
              className="w-24 rounded-lg border border-border bg-bg px-2.5 py-2 font-mono text-sm text-ink outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={() => remove(index)}
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
        onClick={() => onChange([...entries, ["", ""]])}
        className="flex w-fit items-center gap-1 text-xs font-semibold text-brand-text hover:underline"
      >
        <Plus className="h-3 w-3" aria-hidden="true" /> Характеристика
      </button>
    </div>
  );
}

export default function NewAdminProductPage() {
  const router = useRouter();
  const pushToast = useToastStore((state) => state.push);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: categoriesData } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => listAdminCategories(1, 100),
  });
  const categories = categoriesData?.items ?? [];

  // --- Основное ---
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [attrEntries, setAttrEntries] = useState<[string, string][]>([]);

  // --- Первый вариант -- каждый товар должен быть готов к продаже сразу
  // после создания, а не оставаться пустой карточкой без SKU/цены до тех
  // пор, пока кто-то не вспомнит зайти и доделать. SKU подсказывается от
  // слага, а не остаётся пустым -- для однотипных партий это easily правится
  // вручную, но по умолчанию не требует придумывать SKU с нуля. ---
  const [sku, setSku] = useState("");
  const [skuTouched, setSkuTouched] = useState(false);
  const [options, setOptions] = useState("");
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [stockQty, setStockQty] = useState("0");

  // --- Фото ---
  const [images, setImages] = useState<PendingImage[]>([]);

  // Set once the product row itself exists (step 1 of the create sequence
  // succeeded) -- keeps a retry of the variant/photos step from re-submitting
  // the product itself and hitting a duplicate-slug conflict.
  const [createdProduct, setCreatedProduct] = useState<AdminProductDetail | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);

  const canSubmitBasics = useMemo(
    () => name.trim() && slug.trim() && categoryId && sku.trim() && price.trim(),
    [name, slug, categoryId, sku, price]
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminProduct({
        name: name.trim(),
        slug: slug.trim(),
        category_id: categoryId,
        description: description.trim() || null,
        attributes: Object.fromEntries(attrEntries.filter(([key]) => key.trim())),
      }),
    onSuccess: (product) => {
      setCreatedProduct(product);
      finishMutation.mutate(product.id);
    },
  });

  const finishMutation = useMutation({
    mutationFn: async (productId: string) => {
      await createAdminVariant(productId, {
        sku: sku.trim(),
        options: parseOptions(options),
        price,
        compare_at_price: compareAtPrice.trim() || null,
        stock_qty: Number(stockQty) || 0,
      });
      if (images.length > 0) {
        await Promise.all(images.map((image) => uploadAdminProductImage(productId, image.file)));
      }
    },
    onSuccess: () => {
      pushToast(`Товар «${name.trim()}» создан и готов к продаже`);
      router.push(`/admin/products?product=${createdProduct?.id}`);
    },
    onError: (err: unknown) => setFinishError(errorMessage(err, "Не удалось сохранить вариант")),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (createdProduct) {
      // A previous attempt already created the product row -- only retry
      // the variant/photos step, not product creation again.
      setFinishError(null);
      finishMutation.mutate(createdProduct.id);
      return;
    }
    createMutation.mutate();
  }

  function addImages(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...next]);
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const removed = prev.find((image) => image.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((image) => image.id !== id);
    });
  }

  const isPending = createMutation.isPending || finishMutation.isPending;
  const productCreateError = createMutation.isError
    ? errorMessage(createMutation.error, "Не удалось создать товар")
    : null;

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-baseline justify-between">
        <p className="font-display text-lg font-extrabold text-ink">Новый товар</p>
        <p className="text-xs text-ink-muted">
          Название, вариант и фото — в одном шаге, товар сразу готов к продаже.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <fieldset disabled={Boolean(createdProduct)} className={SECTION_CLASS}>
          <legend className="mb-1 font-display text-sm font-bold text-ink">Основное</legend>
          <div>
            <label className={LABEL_CLASS}>Название</label>
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!slugTouched) setSlug(slugify(event.target.value));
                if (!skuTouched) setSku(slugify(event.target.value).toUpperCase());
              }}
              required
              autoFocus
              className={INPUT_CLASS}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Категория</label>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
                className={INPUT_CLASS}
              >
                <option value="" disabled>
                  Выберите категорию
                </option>
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
                onChange={(event) => {
                  setSlug(event.target.value);
                  setSlugTouched(true);
                }}
                required
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
          <AttributeRows entries={attrEntries} onChange={setAttrEntries} />
        </fieldset>

        {/* Stays editable even after the product row is created (unlike the
            "Основное" fieldset above) -- a failed variant save (e.g. a SKU
            clash) needs to be fixable right here for the retry button below
            to mean anything. */}
        <fieldset className={SECTION_CLASS}>
          <legend className="mb-1 font-display text-sm font-bold text-ink">
            Первый вариант
          </legend>
          <p className="-mt-2 text-xs text-ink-muted">
            У товара должен быть хотя бы один вариант с ценой, иначе его нельзя купить. Ещё
            варианты (цвета, объёмы) можно добавить сразу после создания.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>SKU</label>
              <input
                value={sku}
                onChange={(event) => {
                  setSku(event.target.value);
                  setSkuTouched(true);
                }}
                required
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Опции (цвет=красный; объём=1л)</label>
              <input
                value={options}
                onChange={(event) => setOptions(event.target.value)}
                placeholder="необязательно"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Цена</label>
              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required
                inputMode="decimal"
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Старая цена (для скидки)</label>
              <input
                value={compareAtPrice}
                onChange={(event) => setCompareAtPrice(event.target.value)}
                placeholder="необязательно"
                inputMode="decimal"
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Остаток</label>
              <input
                value={stockQty}
                onChange={(event) => setStockQty(event.target.value)}
                inputMode="numeric"
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className={SECTION_CLASS}>
          <legend className="mb-1 font-display text-sm font-bold text-ink">Фото</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((image) => (
              <div
                key={image.id}
                className="relative aspect-square overflow-hidden rounded-lg border border-border bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview, next/image optimization doesn't apply */}
                <img src={image.previewUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(image.id)}
                  aria-label="Убрать фото"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/60 text-bg hover:bg-ink/80"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-ink/20 text-ink-muted hover:border-brand hover:text-brand"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs font-semibold">Добавить</span>
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              addImages(event.target.files);
              event.target.value = "";
            }}
            className="hidden"
          />
          <p className="text-xs text-ink-muted">
            Можно выбрать сразу несколько файлов. Порядок и главное фото можно поменять после
            создания.
          </p>
        </fieldset>

        {productCreateError && (
          <p className="text-sm text-accent-sale-700">{productCreateError}</p>
        )}
        {finishError && (
          <div className="rounded-lg bg-accent-sale/10 p-3 text-sm text-accent-sale-700">
            <p>{finishError}</p>
            <p className="mt-1 text-xs">
              Товар «{name.trim()}» уже создан — можно исправить вариант и нажать «Сохранить
              вариант» ещё раз, либо{" "}
              <button
                type="button"
                onClick={() => router.push(`/admin/products?product=${createdProduct?.id}`)}
                className="underline"
              >
                перейти к товару
              </button>{" "}
              и доделать там.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmitBasics || isPending}
            className="rounded-lg bg-brand px-5 py-2.5 font-display text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {isPending
              ? "Создание…"
              : createdProduct
                ? "Сохранить вариант"
                : "Создать товар"}
          </button>
          {!createdProduct && (
            <p className="text-xs text-ink-muted">
              Похожий товар уже есть?{" "}
              <Link href="/admin/products" className="text-brand-text underline">
                Продублируйте его из списка товаров
              </Link>{" "}
              — быстрее, чем заполнять заново.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
