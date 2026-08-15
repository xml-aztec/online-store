"use client";

import { useEffect, useState } from "react";

import { prefersReducedMotion } from "@/shared/lib/useHorizontalScroll";

/**
 * Keeps a conditionally-rendered element (drawer, toast, dropdown, sticky
 * bar) mounted long enough to play its CSS exit transition instead of
 * disappearing instantly the moment `active` goes false.
 *
 * `shouldRender` gates whether the element is in the DOM at all.
 * `isVisible` gates the "entered" CSS state (the class/style that represents
 * the on-screen position) -- toggle it a frame after mount so the browser
 * has a from-state to transition away from, and toggle it off immediately
 * on exit so the transition plays before unmount.
 *
 * Under prefers-reduced-motion the exit delay collapses to near-zero --
 * the CSS transition itself is already neutralized by the global
 * `@media (prefers-reduced-motion: reduce)` rule in globals.css, so there's
 * nothing left to wait for.
 */
export function useMountTransition(active: boolean, durationMs: number) {
  const [shouldRender, setShouldRender] = useState(active);
  const [isVisible, setIsVisible] = useState(active);

  // Render-phase state adjustments (React's documented "adjust state during
  // render" pattern, compared against existing state rather than a ref --
  // both are naturally idempotent, firing exactly once per transition with
  // no extra render round-trip and no delay before they take effect):
  //   - mount the instant `active` goes true.
  //   - start the exit transition the instant `active` goes false.
  if (active && !shouldRender) setShouldRender(true);
  if (!active && isVisible) setIsVisible(false);

  useEffect(() => {
    if (active) {
      // One frame after mount, flip to the "entered" CSS state so the
      // transition has a from-state to animate away from instead of
      // rendering already-settled.
      const raf = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(raf);
    }

    const delay = prefersReducedMotion() ? 0 : durationMs;
    const timeout = setTimeout(() => setShouldRender(false), delay);
    return () => clearTimeout(timeout);
  }, [active, durationMs]);

  return { shouldRender, isVisible };
}
