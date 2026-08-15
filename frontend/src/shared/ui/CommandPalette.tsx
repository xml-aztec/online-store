"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  LayoutDashboard,
  Package,
  Plus,
  Rows3,
  Search,
  Tag,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ComponentType, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { listAdminOrders } from "@/entities/orders/adminApi";
import { listAdminProducts } from "@/entities/product/adminApi";
import { useAdminPortalRoot } from "@/shared/lib/adminPortalContext";
import { formatPrice } from "@/shared/lib/formatPrice";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface StaticAction {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  run: (router: ReturnType<typeof useRouter>) => void;
}

const NAV_ACTIONS: StaticAction[] = [
  { id: "nav-dashboard", label: "Дашборд", icon: LayoutDashboard, run: (r) => r.push("/admin") },
  { id: "nav-orders", label: "Заказы", icon: ClipboardList, run: (r) => r.push("/admin/orders") },
  { id: "nav-products", label: "Товары", icon: Package, run: (r) => r.push("/admin/products") },
  { id: "nav-categories", label: "Категории", icon: Rows3, run: (r) => r.push("/admin/categories") },
  { id: "nav-promo", label: "Промокоды", icon: Tag, run: (r) => r.push("/admin/promo-codes") },
  { id: "nav-imports", label: "Импорт из Excel", icon: Upload, run: (r) => r.push("/admin/imports") },
];

const CREATE_ACTIONS: StaticAction[] = [
  { id: "create-product", label: "Создать товар", icon: Plus, run: (r) => r.push("/admin/products/new") },
  {
    id: "create-promo",
    label: "Создать промокод",
    icon: Plus,
    run: (r) => r.push("/admin/promo-codes?new=1"),
  },
  {
    id: "create-category",
    label: "Создать категорию",
    icon: Plus,
    run: (r) => r.push("/admin/categories"),
  },
];

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_MIN_LENGTH = 2;
const RESULT_LIMIT = 5;

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const portalRoot = useAdminPortalRoot();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  // Reset the search text the instant `open` flips to true -- adjusted during
  // render (React's documented pattern for "state depending on a prop
  // change"), not in an effect, so there's no extra frame where stale text
  // from the last time the palette was open flashes before clearing.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setDebounced("");
    }
  }

  useEffect(() => {
    if (!open) return;
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const searching = debounced.length >= SEARCH_MIN_LENGTH;

  const ordersQuery = useQuery({
    queryKey: ["command-palette-orders", debounced],
    queryFn: () => listAdminOrders({ search: debounced, page: 1, pageSize: RESULT_LIMIT }),
    enabled: open && searching,
  });
  const productsQuery = useQuery({
    queryKey: ["command-palette-products", debounced],
    queryFn: () => listAdminProducts({ search: debounced, page: 1, pageSize: RESULT_LIMIT }),
    enabled: open && searching,
  });

  const filteredNav = useMemo(
    () =>
      searching
        ? NAV_ACTIONS.filter((a) => a.label.toLowerCase().includes(debounced.toLowerCase()))
        : NAV_ACTIONS,
    [searching, debounced]
  );
  const filteredCreate = useMemo(
    () =>
      searching
        ? CREATE_ACTIONS.filter((a) => a.label.toLowerCase().includes(debounced.toLowerCase()))
        : CREATE_ACTIONS,
    [searching, debounced]
  );

  function runAction(action: StaticAction) {
    action.run(router);
    onClose();
  }

  if (!open || !portalRoot) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-center px-4 pt-[12vh]">
      {/* Deliberately always-dark, not `bg-ink` -- see Drawer.tsx's backdrop
          comment for why. */}
      <div aria-hidden="true" className="absolute inset-0 bg-[#14161a]/45" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Поиск и команды"
        className="relative flex h-fit max-h-[70vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl bg-bg shadow-[0_24px_64px_rgba(20,22,26,0.22)]"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" strokeWidth={2.2} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Заказ, товар, раздел, действие…"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
            esc
          </span>
        </div>

        <div className="flex-1 overflow-y-auto py-1.5">
          {searching && ordersQuery.data && ordersQuery.data.items.length > 0 && (
            <PaletteSection label="Заказы">
              {ordersQuery.data.items.map((order) => (
                <PaletteRow
                  key={order.id}
                  onClick={() => {
                    router.push(`/admin/orders?order=${order.id}`);
                    onClose();
                  }}
                >
                  <span className="font-mono text-xs font-semibold text-ink-muted">
                    №{order.number}
                  </span>
                  <span className="flex-1 truncate text-[13px] text-ink">{order.full_name}</span>
                  <span className="font-mono text-xs text-ink-muted">{formatPrice(order.total)}</span>
                </PaletteRow>
              ))}
            </PaletteSection>
          )}

          {searching && productsQuery.data && productsQuery.data.items.length > 0 && (
            <PaletteSection label="Товары">
              {productsQuery.data.items.map((product) => (
                <PaletteRow
                  key={product.id}
                  onClick={() => {
                    router.push(`/admin/products?product=${product.id}`);
                    onClose();
                  }}
                >
                  <span className="flex-1 truncate text-[13px] text-ink">{product.name}</span>
                  <span className="font-mono text-xs text-ink-muted">{product.slug}</span>
                </PaletteRow>
              ))}
            </PaletteSection>
          )}

          {filteredCreate.length > 0 && (
            <PaletteSection label="Действия">
              {filteredCreate.map((action) => (
                <PaletteRow key={action.id} onClick={() => runAction(action)}>
                  <action.icon className="h-3.5 w-3.5 text-brand" />
                  <span className="flex-1 text-[13px] font-semibold text-ink">{action.label}</span>
                </PaletteRow>
              ))}
            </PaletteSection>
          )}

          {filteredNav.length > 0 && (
            <PaletteSection label="Переходы">
              {filteredNav.map((action) => (
                <PaletteRow key={action.id} onClick={() => runAction(action)}>
                  <action.icon className="h-3.5 w-3.5 text-ink-muted" />
                  <span className="flex-1 text-[13px] text-ink">{action.label}</span>
                </PaletteRow>
              ))}
            </PaletteSection>
          )}

          {searching &&
            !ordersQuery.isLoading &&
            !productsQuery.isLoading &&
            (ordersQuery.data?.items.length ?? 0) === 0 &&
            (productsQuery.data?.items.length ?? 0) === 0 &&
            filteredNav.length === 0 &&
            filteredCreate.length === 0 && (
              <p className="px-4 py-6 text-center text-[13px] text-ink-muted">Ничего не найдено</p>
            )}
        </div>

        <div className="flex items-center gap-3.5 border-t border-border px-4 py-2.5 text-[11px] text-ink-muted">
          <span>
            <span className="font-mono">↵</span> открыть
          </span>
          <span>
            <span className="font-mono">esc</span> закрыть
          </span>
        </div>
      </div>
    </div>,
    portalRoot
  );
}

function PaletteSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </div>
      {children}
    </div>
  );
}

function PaletteRow({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-2 flex w-[calc(100%-16px)] items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-surface"
    >
      {children}
    </button>
  );
}
