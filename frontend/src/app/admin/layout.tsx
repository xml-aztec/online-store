"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  GalleryHorizontal,
  Home,
  LayoutDashboard,
  LogOut,
  Package,
  Rows3,
  Star,
  Tag,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { logout, useAuthStore } from "@/entities/auth/store";
import { getOrderStatusCounts } from "@/entities/orders/adminApi";

const ALLOWED_ROLES = new Set(["manager", "admin"]);
const NEW_ORDER_STATUSES = ["pending", "awaiting_payment"];

interface NavLink {
  href: string;
  label: string;
  icon: typeof Home;
  adminOnly?: boolean;
  badge?: number;
}

function isNavLinkActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, role, email } = useAuthStore();
  const isAuthorized = status === "authenticated" && role !== null && ALLOWED_ROLES.has(role);

  const { data: statusCounts } = useQuery({
    queryKey: ["admin-order-status-counts"],
    queryFn: getOrderStatusCounts,
    enabled: isAuthorized,
  });
  const newOrdersCount = NEW_ORDER_STATUSES.reduce(
    (sum, key) => sum + (statusCounts?.counts[key] ?? 0),
    0
  );

  const navLinks: NavLink[] = [
    { href: "/admin", label: "Дашборд", icon: LayoutDashboard },
    { href: "/admin/orders", label: "Заказы", icon: ClipboardList, badge: newOrdersCount },
    { href: "/admin/reviews", label: "Отзывы", icon: Star },
    { href: "/admin/categories", label: "Категории", icon: Rows3, adminOnly: true },
    { href: "/admin/products", label: "Товары", icon: Package, adminOnly: true },
    { href: "/admin/banners", label: "Баннеры", icon: GalleryHorizontal, adminOnly: true },
    { href: "/admin/imports", label: "Импорт", icon: Upload, adminOnly: true },
    { href: "/admin/promo-codes", label: "Промокоды", icon: Tag, adminOnly: true },
    { href: "/admin/users", label: "Пользователи", icon: Users, adminOnly: true },
  ];

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

  const initials = (email ?? "").slice(0, 2).toUpperCase();

  return (
    <div className="grid min-h-screen grid-cols-[208px_1fr] bg-surface">
      <aside className="flex flex-col gap-0.5 border-r border-ink/10 bg-bg p-3">
        <Link href="/admin" className="mb-4 flex items-center gap-2 px-2 pt-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
            <Home className="h-[15px] w-[15px] text-white" aria-hidden="true" strokeWidth={2.2} />
          </span>
          <span className="font-display text-[15px] font-extrabold text-ink">
            HobbyLife <span className="text-[11px] font-semibold text-ink-muted">админ</span>
          </span>
        </Link>

        {navLinks
          .filter((link) => !link.adminOnly || role === "admin")
          .map((link) => {
            const active = isNavLinkActive(pathname, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-[38px] items-center gap-2.5 rounded-lg px-3 font-display text-[13px] font-bold transition ${
                  active ? "bg-brand text-white" : "text-ink-muted hover:bg-surface hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {link.label}
                {Boolean(link.badge) && (
                  <span
                    className={`ml-auto flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold ${
                      active ? "bg-white/25 text-white" : "bg-accent-sale text-white"
                    }`}
                  >
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}

        <div className="mt-auto flex items-center gap-2 border-t border-ink/10 p-2 pt-3">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-surface font-display text-xs font-bold text-ink">
            {initials || "?"}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{email}</span>
          <button
            type="button"
            onClick={() => {
              void logout().then(() => router.push("/login"));
            }}
            aria-label="Выйти"
            className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </aside>
      <main className="px-7 py-8">{children}</main>
    </div>
  );
}
