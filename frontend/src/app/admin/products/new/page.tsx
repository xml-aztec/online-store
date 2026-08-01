"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { listAdminCategories } from "@/entities/category/adminApi";
import { createAdminProduct } from "@/entities/product/adminApi";
import { ApiError } from "@/shared/api/client";
import { slugify } from "@/shared/lib/slugify";

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
    <div>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        Новый товар
      </h1>
      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">Название</label>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTouched) setSlug(slugify(event.target.value));
            }}
            required
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">Слаг</label>
          <input
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugTouched(true);
            }}
            required
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">Категория</label>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            required
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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
          <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">Описание</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        {mutation.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : "Не удалось создать товар"}
          </p>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {mutation.isPending ? "Создание…" : "Создать и продолжить"}
        </button>
        <p className="text-xs text-zinc-500">
          После создания вы сможете добавить варианты и фотографии.
        </p>
      </form>
    </div>
  );
}
