"use client";

import { Search, ShoppingCart, User, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { cartItemCount, useCartQuery } from "@/entities/cart/queries";
import { useAuthStore } from "@/entities/auth/store";
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
      <div className="p-4 text-sm text-ink-muted">Ничего не найдено</div>
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
          <li key={product.id}>
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
  const scrolled = useScrolled();
  const pathname = usePathname();
  const [previewClosedForPathname, setPreviewClosedForPathname] = useState(pathname);

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

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
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
        className={`mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 transition-[padding] duration-200 sm:gap-4 ${
          scrolled ? "py-2" : "py-3"
        }`}
      >
        <Link
          href="/"
          className="shrink-0 rounded-lg font-display text-lg font-extrabold tracking-tight text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          HobbyLife
        </Link>

        <div ref={searchBoxRef} className="relative order-3 w-full sm:order-none sm:flex-1">
          <form onSubmit={handleSearchSubmit} role="search">
            <label htmlFor="header-search" className="sr-only">
              Поиск товаров
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              />
              <input
                id="header-search"
                type="search"
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
                className="w-full rounded-lg border border-ink/15 bg-surface py-2.5 pl-10 pr-9 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:bg-bg focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setPreviewOpen(false);
                  }}
                  aria-label="Очистить поиск"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>

          {showPreview && (
            <div className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-xl border border-ink/10 bg-bg shadow-md">
              <SearchPreview results={previewResults} loading={previewLoading} />
            </div>
          )}
        </div>

        {status === "authenticated" ? (
          <Link
            href={role === "manager" || role === "admin" ? "/admin" : "/account"}
            className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink sm:flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <User className="h-4 w-4" aria-hidden="true" />
            {role === "manager" || role === "admin" ? "Админка" : "Профиль"}
          </Link>
        ) : (
          <Link
            href="/login"
            className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink sm:flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <User className="h-4 w-4" aria-hidden="true" />
            Войти
          </Link>
        )}

        <Link
          href="/cart"
          className="relative flex shrink-0 items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          aria-label={`Корзина, товаров: ${itemCount}`}
        >
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          <span
            className={`font-mono tabular-nums ${cartPulsing ? "animate-cart-pulse" : ""}`}
          >
            {itemCount}
          </span>
        </Link>
      </div>
    </header>
  );
}
