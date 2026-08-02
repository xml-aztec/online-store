"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { logout, useAuthStore } from "@/entities/auth/store";

const ALLOWED_ROLES = new Set(["manager", "admin"]);

interface NavLink {
  href: string;
  label: string;
  adminOnly?: boolean;
}

const NAV_LINKS: NavLink[] = [
  { href: "/admin", label: "Дашборд" },
  { href: "/admin/orders", label: "Заказы" },
  { href: "/admin/categories", label: "Категории", adminOnly: true },
  { href: "/admin/products", label: "Товары", adminOnly: true },
  { href: "/admin/imports", label: "Импорт", adminOnly: true },
  { href: "/admin/promo-codes", label: "Промокоды", adminOnly: true },
  { href: "/admin/users", label: "Пользователи", adminOnly: true },
];

function isNavLinkActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

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
      <div className="flex min-h-screen items-center justify-center text-ink-muted">Загрузка…</div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-ink/10 bg-bg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="flex gap-4 text-sm font-medium">
            {NAV_LINKS.filter((link) => !link.adminOnly || role === "admin").map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isNavLinkActive(pathname, link.href) ? "page" : undefined}
                className={
                  isNavLinkActive(pathname, link.href)
                    ? "font-semibold text-brand"
                    : "text-ink-muted hover:text-ink"
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            <span>{email}</span>
            <button
              type="button"
              onClick={() => {
                void logout().then(() => router.push("/login"));
              }}
              className="underline hover:text-ink"
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
