"use client";

import { Home, LayoutGrid, ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuthStore } from "@/entities/auth/store";
import { cartItemCount, useCartQuery } from "@/entities/cart/queries";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
  isActive: (pathname: string) => boolean;
}

export function BottomNav() {
  const pathname = usePathname();
  const { data: cart } = useCartQuery();
  const itemCount = cartItemCount(cart);
  const { status, role } = useAuthStore();

  const profileHref =
    status === "authenticated" ? (role === "manager" || role === "admin" ? "/admin" : "/account") : "/login";

  const items: NavItem[] = [
    { href: "/", label: "Главная", icon: Home, isActive: (p) => p === "/" },
    {
      href: "/catalog",
      label: "Каталог",
      icon: LayoutGrid,
      isActive: (p) => p.startsWith("/catalog"),
    },
    {
      href: "/cart",
      label: "Корзина",
      icon: ShoppingCart,
      isActive: (p) => p.startsWith("/cart"),
    },
    {
      href: profileHref,
      label: status === "authenticated" ? "Профиль" : "Войти",
      icon: User,
      isActive: (p) => p.startsWith("/account") || p.startsWith("/admin") || p.startsWith("/login"),
    },
  ];

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-bg lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-4">
        {items.map(({ href, label, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={href === "/cart" ? `${label}, товаров: ${itemCount}` : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
                active ? "text-brand" : "text-ink-muted"
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {href === "/cart" && itemCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-sale px-1 font-mono text-[9px] font-semibold leading-none text-white"
                  >
                    {itemCount}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
