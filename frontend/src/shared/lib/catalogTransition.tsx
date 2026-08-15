"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition, type ReactNode } from "react";

interface CatalogTransitionContextValue {
  isPending: boolean;
  navigate: (href: string) => void;
}

const CatalogTransitionContext = createContext<CatalogTransitionContextValue | null>(null);

// Wraps the catalog page's filter/sort/pagination controls AND its results
// column in one shared `useTransition` -- every control that changes the
// product list navigates through `navigate()` below instead of calling
// `router.push` directly, so `isPending` reflects ANY of them, not just one.
// That's what lets the results column dim (see CatalogResultsFade) while
// Next fetches the new RSC payload, instead of the old list just vanishing
// the instant a filter/sort/page link is clicked.
export function CatalogTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <CatalogTransitionContext.Provider value={{ isPending, navigate }}>
      {children}
    </CatalogTransitionContext.Provider>
  );
}

export function useCatalogTransition(): CatalogTransitionContextValue {
  const ctx = useContext(CatalogTransitionContext);
  if (!ctx) {
    throw new Error("useCatalogTransition must be used within CatalogTransitionProvider");
  }
  return ctx;
}
