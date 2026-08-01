"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { cartItemCount, useCartQuery } from "@/entities/cart/queries";
import { useAuthStore } from "@/entities/auth/store";

export function Header() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { data: cart } = useCartQuery();
  const itemCount = cartItemCount(cart);
  const { status, role } = useAuthStore();

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/catalog?q=${encodeURIComponent(trimmed)}` : "/catalog");
  }

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:gap-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          HobbyLife
        </Link>

        <form
          onSubmit={handleSearchSubmit}
          className="order-3 w-full sm:order-none sm:flex-1"
          role="search"
        >
          <label htmlFor="header-search" className="sr-only">
            Поиск товаров
          </label>
          <input
            id="header-search"
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск товаров…"
            className="w-full rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </form>

        {status === "authenticated" ? (
          <Link
            href={role === "manager" || role === "admin" ? "/admin" : "/account"}
            className="shrink-0 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            {role === "manager" || role === "admin" ? "Админка" : "Профиль"}
          </Link>
        ) : (
          <Link
            href="/login"
            className="shrink-0 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            Войти
          </Link>
        )}

        <Link
          href="/cart"
          className="flex shrink-0 items-center gap-2 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
          aria-label={`Корзина, товаров: ${itemCount}`}
        >
          <span aria-hidden="true">🛒</span>
          <span>{itemCount}</span>
        </Link>
      </div>
    </header>
  );
}
