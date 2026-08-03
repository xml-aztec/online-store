"use client";

import { useQuery } from "@tanstack/react-query";
import { Heart, LogOut, MapPin, Package, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { getMe } from "@/entities/auth/api";
import { logout, useAuthStore } from "@/entities/auth/store";

const NAV_LINKS = [
  { href: "/account", label: "Профиль", icon: User },
  { href: "/account/orders", label: "Мои заказы", icon: Package },
  { href: "/account/addresses", label: "Адреса", icon: MapPin },
  { href: "/favorites", label: "Избранное", icon: Heart },
];

function isNavLinkActive(pathname: string, href: string): boolean {
  return href === "/account" ? pathname === "/account" : pathname.startsWith(href);
}

export default function AccountLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, email } = useAuthStore();
  const isAuthorized = status === "authenticated";
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe, enabled: isAuthorized });

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

  const initials = (me?.full_name ?? email ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <h1 className="mb-5 font-display text-xl font-bold text-ink sm:text-2xl">Личный кабинет</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr] lg:items-start">
        <aside className="flex flex-col gap-1">
          <div className="mb-2 flex items-center gap-3 p-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/10 font-display text-base font-extrabold text-brand">
              {initials || "?"}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold text-ink">
                {me?.full_name || "Профиль"}
              </p>
              {me?.phone && <p className="truncate text-xs text-ink-muted">{me.phone}</p>}
            </div>
          </div>

          {NAV_LINKS.map((link) => {
            const active = isNavLinkActive(pathname, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 items-center gap-2.5 rounded-xl px-3.5 font-display text-sm font-bold transition ${
                  active
                    ? "bg-surface text-ink"
                    : "text-ink-muted hover:bg-surface hover:text-ink"
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                {link.label}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => {
              void logout().then(() => router.push("/"));
            }}
            className="mt-3 flex h-11 items-center gap-2.5 rounded-xl px-3.5 text-sm font-semibold text-ink-muted hover:bg-surface hover:text-ink"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            Выйти
          </button>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
