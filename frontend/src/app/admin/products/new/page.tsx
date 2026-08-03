"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { listAdminCategories } from "@/entities/category/adminApi";
import { createAdminProduct } from "@/entities/product/adminApi";
import { ApiError } from "@/shared/api/client";
import { slugify } from "@/shared/lib/slugify";

const INPUT_CLASS =
  "w-full rounded-lg border border-ink/15 bg-bg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-ink-muted";

export default function NewAdminProductPage() {
  const router = useRouter();
  const { data: categoriesData } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => listAdminCategories(1, 100),
  });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createAdminProduct({
        name,
        slug,
        category_id: categoryId,
        description: description || null,
        attributes: {},
      }),
    onSuccess: (created) => router.push(`/admin/products/${created.id}`),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  const categories = categoriesData?.items ?? [];

  return (
    <div className="max-w-2xl rounded-2xl bg-surface p-6">
      <p className="mb-4 font-display text-lg font-extrabold text-ink">Новый товар</p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border border-ink/10 bg-bg p-5"
      >
        <div>
          <label className={LABEL_CLASS}>Название</label>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTouched) setSlug(slugify(event.target.value));
            }}
            required
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
        {mutation.isError && (
          <p className="text-sm text-accent-sale-700">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : "Не удалось создать товар"}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-brand px-5 py-2.5 font-display text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {mutation.isPending ? "Создание…" : "Создать и продолжить"}
          </button>
          <p className="text-xs text-ink-muted">
            После создания вы сможете добавить варианты и фотографии.
          </p>
        </div>
      </form>
    </div>
  );
}
