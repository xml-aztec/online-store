"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuthStore } from "@/entities/auth/store";
import { useFavoritesListQuery } from "@/entities/favorites/queries";
import { FavoritesView } from "@/widgets/FavoritesView";

export default function FavoritesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useAuthStore();
  const isAuthorized = status === "authenticated";
  // Same query key as FavoritesView -- React Query dedupes this into a
  // single request, this just reads the cached total for the heading count.
  const { data } = useFavoritesListQuery();

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
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:py-8">
      <h1 className="mb-6 font-display text-xl font-bold text-ink sm:text-2xl">
        Избранное{" "}
        {data && data.total > 0 && (
          <span className="font-mono text-base font-semibold text-ink-muted sm:text-xl">
            ({data.total})
          </span>
        )}
      </h1>
      <FavoritesView />
    </div>
  );
}
