"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { useHorizontalScroll } from "@/shared/lib/useHorizontalScroll";

interface ProductCarouselProps {
  title: string;
  viewAllHref?: string;
  children: ReactNode;
}

export function ProductCarousel({ title, viewAllHref, children }: ProductCarouselProps) {
  const { ref, canScrollLeft, canScrollRight, scrollByAmount } = useHorizontalScroll();

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        <div className="flex items-center gap-3">
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="text-sm font-medium text-brand hover:text-brand/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Все →
            </Link>
          )}
          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              onClick={() => scrollByAmount(-1)}
              disabled={!canScrollLeft}
              aria-label="Прокрутить назад"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 text-ink-muted hover:text-ink disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollByAmount(1)}
              disabled={!canScrollRight}
              aria-label="Прокрутить вперёд"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 text-ink-muted hover:text-ink disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={ref}
        className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </section>
  );
}
