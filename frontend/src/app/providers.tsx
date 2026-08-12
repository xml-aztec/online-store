"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";

import { bootstrapSession } from "@/entities/auth/store";
import { CART_QUERY_KEY } from "@/entities/cart/queries";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    // The cart query has no auth gate (it must also work for guests), so on
    // a hard reload it fires immediately -- before the access token is back
    // from the httpOnly refresh cookie (in-memory only, per ТЗ 5.5) -- and
    // caches a stale guest-view empty cart. Refetch once bootstrap settles
    // (either way: authenticated or anonymous) so a logged-in user's real
    // cart replaces that stale snapshot instead of silently sticking around.
    void bootstrapSession().then(() => {
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
    });
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
