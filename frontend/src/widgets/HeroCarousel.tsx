"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { prefersReducedMotion } from "@/shared/lib/useHorizontalScroll";

export function HeroCarousel({ slides }: { slides: ReactNode[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onScroll() {
      if (!el || el.clientWidth === 0) return;
      setActive(Math.round(el.scrollLeft / el.clientWidth));
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function goTo(index: number) {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  if (slides.length === 0) return null;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, index) => (
          <div key={index} className="w-full shrink-0 snap-start">
            {slide}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(Math.max(0, active - 1))}
            disabled={active === 0}
            aria-label="Предыдущий слайд"
            className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-bg/90 p-2 text-ink shadow-md hover:bg-bg disabled:pointer-events-none disabled:opacity-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:flex"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => goTo(Math.min(slides.length - 1, active + 1))}
            disabled={active === slides.length - 1}
            aria-label="Следующий слайд"
            className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-bg/90 p-2 text-ink shadow-md hover:bg-bg disabled:pointer-events-none disabled:opacity-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:flex"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>

          <div role="group" aria-label="Слайды" className="mt-3 flex justify-center gap-1.5">
            {slides.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goTo(index)}
                aria-label={`Слайд ${index + 1}`}
                aria-pressed={index === active}
                className={`h-1.5 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  index === active ? "w-6 bg-brand" : "w-1.5 bg-ink/20"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
