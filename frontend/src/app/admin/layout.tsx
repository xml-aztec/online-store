"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { logout, useAuthStore } from "@/entities/auth/store";

const ALLOWED_ROLES = new Set(["manager", "admin"]);

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, role, email } = useAuthStore();
  const isAuthorized = status === "authenticated" && role !== null && ALLOWED_ROLES.has(role);

  useEffect(() => {
    if (status !== "loading" && !isAuthorized) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [status, isAuthorized, pathname, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">Загрузка…</div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="flex gap-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <Link href="/admin" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Дашборд
            </Link>
            <Link href="/admin/orders" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Заказы
            </Link>
            {role === "admin" && (
              <Link href="/admin/products" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                Товары
              </Link>
            )}
            {role === "admin" && (
              <Link href="/admin/imports" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                Импорт
              </Link>
            )}
            {role === "admin" && (
              <Link
                href="/admin/promo-codes"
                className="hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Промокоды
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <span>{email}</span>
            <button
              type="button"
              onClick={() => {
                void logout().then(() => router.push("/login"));
              }}
              className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
