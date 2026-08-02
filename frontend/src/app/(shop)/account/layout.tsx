"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { logout, useAuthStore } from "@/entities/auth/store";

const NAV_LINKS = [
  { href: "/account", label: "Профиль" },
  { href: "/account/orders", label: "Заказы" },
  { href: "/account/addresses", label: "Адреса" },
];

function isNavLinkActive(pathname: string, href: string): boolean {
  return href === "/account" ? pathname === "/account" : pathname.startsWith(href);
}

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
      <div className="flex min-h-screen items-center justify-center text-ink-muted">Загрузка…</div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-4 text-sm font-medium">
          {NAV_LINKS.map((link) => (
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
              void logout().then(() => router.push("/"));
            }}
            className="underline hover:text-ink"
          >
            Выйти
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
