"use client";

import { Heart, Home, Menu, Search, ShoppingCart, User, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cartItemCount, useCartQuery } from "@/entities/cart/queries";
import { useAuthStore } from "@/entities/auth/store";
import { useFavoriteIdsQuery } from "@/entities/favorites/queries";
import { listProducts, type ProductListItem } from "@/entities/product/api";
import { formatPrice } from "@/shared/lib/formatPrice";

const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;

function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > threshold);
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return scrolled;
}

function usePreviousCartPulse(count: number, hasLoaded: boolean) {
  const [pulsing, setPulsing] = useState(false);
  // null until the cart's first real value arrives, so that value isn't
  // compared against the 0 the badge shows before the query resolves --
  // otherwise a returning visitor with items already in their cart would see
  // the badge "pulse" on every page load instead of only on real additions.
  const previousRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hasLoaded) return;

    if (previousRef.current !== null && count > previousRef.current) {
      setPulsing(true);
      const timeout = setTimeout(() => setPulsing(false), 400);
      previousRef.current = count;
      return () => clearTimeout(timeout);
    }
    previousRef.current = count;
  }, [count, hasLoaded]);

  return pulsing;
}

function SearchPreview({ results, loading }: { results: ProductListItem[]; loading: boolean }) {
  if (!loading && results.length === 0) {
    return (
      <div className="animate-content-fade-in p-4 text-sm text-ink-muted">Ничего не найдено</div>
    );
  }

  return (
    <ul className="max-h-96 overflow-y-auto py-2">
      {loading &&
        Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-surface" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface" />
          </li>
        ))}
      {!loading &&
        results.map((product) => (
          <li key={product.id} className="animate-content-fade-in">
            <Link
              href={`/product/${product.slug}`}
              className="flex items-center gap-3 px-4 py-2 hover:bg-surface"
            >
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface">
                {product.image_url && (
                  <Image
                    src={product.image_url}
                    alt=""
                    fill
                    unoptimized
                    sizes="40px"
                    className="object-cover"
                  />
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{product.name}</span>
              <span className="shrink-0 font-mono text-sm font-medium text-ink">
                {formatPrice(product.price_from)}
              </span>
            </Link>
          </li>
        ))}
    </ul>
  );
}

export function Header() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResults, setPreviewResults] = useState<ProductListItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const { data: cart } = useCartQuery();
  const itemCount = cartItemCount(cart);
  const cartPulsing = usePreviousCartPulse(itemCount, cart !== undefined);
  const { status, role } = useAuthStore();
  const { data: favoriteIds } = useFavoriteIdsQuery();
  const favoriteCount = favoriteIds?.length ?? 0;
  const scrolled = useScrolled();
  const pathname = usePathname();
  const [previewClosedForPathname, setPreviewClosedForPathname] = useState(pathname);
  const favoritesActive = pathname.startsWith("/favorites");
  const cartActive = pathname.startsWith("/cart");
  const profileActive =
    pathname.startsWith("/account") || pathname.startsWith("/admin") || pathname.startsWith("/login");

  useEffect(() => {
    const trimmed = query.trim();
    // Below the minimum length the dropdown is hidden by `showPreview` anyway
    // (see render), so there is nothing worth fetching or resetting here.
    if (trimmed.length < SEARCH_MIN_LENGTH) {
      return;
    }

    let ignore = false;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      listProducts({ q: trimmed, page_size: 5 })
        .then((response) => {
          if (ignore) return;
          setPreviewResults(response.items);
          setPreviewLoading(false);
        })
        .catch(() => {
          if (ignore) return;
          setPreviewLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setPreviewOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Closes the dropdown after a suggestion is clicked (or any other
  // navigation happens) -- otherwise it stays open, floating over whatever
  // page the user lands on next. Done during render (React's sanctioned
  // pattern for reacting to a prop change) rather than in an effect, so it
  // doesn't cost an extra post-commit render pass.
  if (pathname !== previewClosedForPathname) {
    setPreviewClosedForPathname(pathname);
    setPreviewOpen(false);
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    setPreviewOpen(false);
    router.push(trimmed ? `/catalog?q=${encodeURIComponent(trimmed)}` : "/catalog");
  }

  const showPreview = previewOpen && query.trim().length >= SEARCH_MIN_LENGTH;

  return (
    <header
      className={`sticky top-0 z-40 border-b border-ink/10 bg-bg transition-[padding,box-shadow] duration-200 ${
        scrolled ? "shadow-sm" : ""
      }`}
    >
      <div
        className={`mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 transition-[padding] duration-200 sm:gap-4 ${
          scrolled ? "py-2" : "py-3"
        }`}
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand">
            <Home className="h-5 w-5 text-white" strokeWidth={2.4} aria-hidden="true" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight text-ink">
            Hobby<span className="text-brand">Life</span>
          </span>
        </Link>

        <Link
          href="/catalog"
          className="hidden h-11 shrink-0 items-center gap-2 rounded-lg bg-brand px-4 font-display text-sm font-bold text-white hover:bg-brand/90 sm:flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Menu className="h-[18px] w-[18px]" aria-hidden="true" />
          Каталог
        </Link>

        <div ref={searchBoxRef} className="relative order-3 w-full sm:order-none sm:flex-1">
          <form onSubmit={handleSearchSubmit} role="search">
            <label htmlFor="header-search" className="sr-only">
              Поиск товаров
            </label>
            <div className="flex h-11 items-center overflow-hidden rounded-lg border-2 border-brand bg-bg">
              <Search
                aria-hidden="true"
                className="ml-3.5 h-4 w-4 shrink-0 text-ink-muted"
              />
              <input
                id="header-search"
                type="text"
                name="q"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPreviewOpen(true);
                }}
                onFocus={() => setPreviewOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setPreviewOpen(false);
                }}
                placeholder="Найти контейнер, лоток, органайзер..."
                autoComplete="off"
                className="min-w-0 flex-1 appearance-none border-0 bg-transparent px-2.5 text-sm text-ink shadow-none outline-none placeholder:text-ink-muted focus:border-0 focus:shadow-none focus:outline-none focus:ring-0"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setPreviewOpen(false);
                  }}
                  aria-label="Очистить поиск"
                  className="mr-2 shrink-0 rounded p-0.5 text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="submit"
                className="hidden h-full shrink-0 bg-brand px-5 font-display text-sm font-bold text-white hover:bg-brand/90 sm:block"
              >
                Найти
              </button>
            </div>
          </form>

          {showPreview && (
            <div className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-xl border border-ink/10 bg-bg shadow-md">
              <SearchPreview results={previewResults} loading={previewLoading} />
            </div>
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-[22px] sm:flex">
          <Link
            href="/favorites"
            className="flex flex-col items-center gap-[3px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            aria-label={`Избранное, товаров: ${favoriteCount}`}
            aria-current={favoritesActive ? "page" : undefined}
          >
            <Heart
              className={favoritesActive ? "h-[22px] w-[22px] fill-ink" : "h-[22px] w-[22px]"}
              strokeWidth={2}
              aria-hidden="true"
            />
            <span className={`text-[11px] ${favoritesActive ? "font-semibold text-ink" : "text-ink-muted"}`}>
              Избранное
            </span>
          </Link>

          <Link
            href="/cart"
            className="relative flex flex-col items-center gap-[3px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            aria-label={`Корзина, товаров: ${itemCount}`}
            aria-current={cartActive ? "page" : undefined}
          >
            <ShoppingCart
              className="h-[22px] w-[22px]"
              strokeWidth={cartActive ? 2.4 : 2}
              aria-hidden="true"
            />
            {itemCount > 0 && (
              <span
                className={`absolute -top-1.5 right-1 flex h-4 min-w-4 items-center justify-center overflow-hidden rounded-full bg-ink px-1 font-mono text-[10px] font-bold text-white ${cartPulsing ? "animate-cart-pulse" : ""}`}
              >
                <span key={itemCount} className="animate-price-tick">
                  {itemCount}
                </span>
              </span>
            )}
            <span className={`text-[11px] ${cartActive ? "font-semibold text-ink" : "text-ink-muted"}`}>
              Корзина
            </span>
          </Link>

          {status === "authenticated" ? (
            <Link
              href={role === "manager" || role === "admin" ? "/admin" : "/account"}
              className="flex flex-col items-center gap-[3px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              aria-current={profileActive ? "page" : undefined}
            >
              <User className="h-[22px] w-[22px]" strokeWidth={profileActive ? 2.4 : 2} aria-hidden="true" />
              <span className={`text-[11px] ${profileActive ? "font-semibold text-ink" : "text-ink-muted"}`}>
                {role === "manager" || role === "admin" ? "Админка" : "Профиль"}
              </span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex flex-col items-center gap-[3px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <User className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
              <span className="text-[11px] text-ink-muted">Войти</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
