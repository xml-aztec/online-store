"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  GalleryHorizontal,
  Home,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Package,
  Rows3,
  Search,
  Store,
  Tag,
  Upload,
  UserCircle,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { logout, useAuthStore } from "@/entities/auth/store";
import { getOrderStatusCounts } from "@/entities/orders/adminApi";
import { useThemeStore } from "@/entities/theme/store";
import { AdminPortalProvider } from "@/shared/lib/adminPortalContext";
import { useAdminHotkeys } from "@/shared/lib/useAdminHotkeys";
import { CommandPalette } from "@/shared/ui/CommandPalette";
import { ShortcutsCheatsheet } from "@/shared/ui/ShortcutsCheatsheet";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";
import { ToastStack } from "@/shared/ui/Toast";

const ALLOWED_ROLES = new Set(["manager", "admin"]);
const NEW_ORDER_STATUSES = ["pending", "awaiting_payment"];

interface NavLink {
  href: string;
  label: string;
  icon: typeof Home;
  adminOnly?: boolean;
  badge?: number;
  hotkey?: string;
}

function isNavLinkActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, role, email } = useAuthStore();
  const theme = useThemeStore((state) => state.theme);
  const isAuthorized = status === "authenticated" && role !== null && ALLOWED_ROLES.has(role);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);

  useAdminHotkeys({
    onOpenPalette: () => setPaletteOpen(true),
    onOpenCheatsheet: () => setCheatsheetOpen(true),
  });

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
    { href: "/admin", label: "Дашборд", icon: LayoutDashboard, hotkey: "G D" },
    {
      href: "/admin/orders",
      label: "Заказы",
      icon: ClipboardList,
      badge: newOrdersCount,
      hotkey: "G O",
    },
    { href: "/admin/categories", label: "Категории", icon: Rows3, adminOnly: true },
    { href: "/admin/products", label: "Товары", icon: Package, adminOnly: true, hotkey: "G P" },
    { href: "/admin/banners", label: "Баннеры", icon: GalleryHorizontal, adminOnly: true },
    { href: "/admin/promo-messages", label: "Бегущая строка", icon: Megaphone, adminOnly: true },
    { href: "/admin/imports", label: "Импорт", icon: Upload, adminOnly: true },
    { href: "/admin/promo-codes", label: "Промокоды", icon: Tag, adminOnly: true },
    { href: "/admin/users", label: "Пользователи", icon: Users, adminOnly: true },
    { href: "/admin/profile", label: "Профиль", icon: UserCircle },
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
    <div data-theme={theme} className="admin-shell bg-bg text-ink">
      <AdminPortalProvider value={portalRoot}>
        <div className="grid min-h-screen grid-cols-[216px_1fr] bg-surface">
          <aside className="flex flex-col gap-0.5 border-r border-border bg-bg p-2.5">
            <Link href="/admin" className="mb-3 flex items-center gap-2 px-2 pt-1">
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-brand">
                <Home className="h-3.5 w-3.5 text-white" aria-hidden="true" strokeWidth={2.2} />
              </span>
              <span className="font-display text-[14px] font-extrabold text-ink">
                HobbyLife <span className="text-[10px] font-semibold text-ink-muted">админ</span>
              </span>
            </Link>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="mb-2.5 flex h-[34px] items-center gap-2 rounded-lg bg-surface px-2.5 text-xs text-ink-muted hover:bg-border/60"
            >
              <Search className="h-[13px] w-[13px]" aria-hidden="true" strokeWidth={2.2} />
              Поиск и команды…
              <span className="ml-auto rounded-md border border-border bg-bg px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                ⌘K
              </span>
            </button>

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
                    className={`flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 font-display text-[13px] font-bold transition ${
                      active
                        ? "bg-brand-soft text-brand-text"
                        : "text-ink-muted hover:bg-surface hover:text-ink"
                    }`}
                  >
                    <Icon className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
                    {link.label}
                    {Boolean(link.badge) && (
                      <span
                        className={`ml-auto flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold ${
                          active ? "bg-brand-text/20 text-brand-text" : "bg-accent-sale text-white"
                        }`}
                      >
                        {link.badge}
                      </span>
                    )}
                    {!link.badge && link.hotkey && (
                      <span className="ml-auto font-mono text-[10px] text-ink-muted">
                        {link.hotkey}
                      </span>
                    )}
                  </Link>
                );
              })}

            <div className="mt-auto flex flex-col gap-2 border-t border-border pt-2.5">
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 font-display text-[13px] font-bold text-ink-muted transition hover:bg-surface hover:text-ink"
              >
                <Store className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
                Открыть магазин
              </a>
              <div className="flex items-center gap-2 px-2">
                <span className="flex-1 text-[11px] text-ink-muted">Тема</span>
                <ThemeToggle />
              </div>
              <div className="flex items-center gap-2 px-2 pb-0.5">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-surface font-display text-xs font-bold text-ink">
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
            </div>
          </aside>
          <main className="bg-surface px-7 py-8">{children}</main>
        </div>

        {/* Drawer/CommandPalette/Toast/ShortcutsCheatsheet all portal in here
            (see shared/lib/adminPortalContext.tsx) instead of document.body,
            so this data-theme wrapper's CSS variable overrides still reach
            them. Populated via ref callback (fires synchronously on mount),
            not an effect -- see adminPortalContext.tsx's comment. */}
        <div ref={setPortalRoot} />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <ShortcutsCheatsheet open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />
        <ToastStack />
      </AdminPortalProvider>
    </div>
  );
}
