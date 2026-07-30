import type { Metadata } from "next";
import Link from "next/link";

import { getCategoryTree } from "@/entities/category/api";
import { listProducts } from "@/entities/product/api";
import { ProductCard } from "@/widgets/ProductCard";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Главная",
};

export default async function HomePage() {
  const [categories, newest, popular] = await Promise.all([
    getCategoryTree(),
    listProducts({ sort: "newest", page_size: 8 }),
    listProducts({ sort: "popular", page_size: 8 }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="rounded-2xl bg-zinc-900 px-6 py-12 text-white sm:px-10 sm:py-16">
        <h1 className="text-2xl font-semibold sm:text-4xl">Товары для дома HobbyLife</h1>
        <p className="mt-3 max-w-xl text-zinc-300">
          Посуда и пищевые контейнеры, товары для кухни и хранения с доставкой по Бишкеку.
        </p>
        <Link
          href="/catalog"
          className="mt-6 inline-block rounded-full bg-white px-6 py-3 text-sm font-medium text-zinc-900"
        >
          Смотреть каталог
        </Link>
      </section>

      {categories.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Категории</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/catalog/${category.slug}`}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:border-zinc-400 dark:border-zinc-700"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {newest.items.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Новинки</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {newest.items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {popular.items.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Популярное</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {popular.items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
