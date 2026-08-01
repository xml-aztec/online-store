"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { logout, useAuthStore } from "@/entities/auth/store";

export default function AccountLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, email } = useAuthStore();
  const isAuthorized = status === "authenticated";

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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          <Link href="/account" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Профиль
          </Link>
          <Link href="/account/orders" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Заказы
          </Link>
          <Link
            href="/account/addresses"
            className="hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Адреса
          </Link>
        </nav>
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span>{email}</span>
          <button
            type="button"
            onClick={() => {
              void logout().then(() => router.push("/"));
            }}
            className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Выйти
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
