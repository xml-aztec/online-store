"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { useAdminPortalRoot } from "@/shared/lib/adminPortalContext";
import { useMountTransition } from "@/shared/lib/useMountTransition";

const TRANSITION_MS = 300;

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** px width of the panel; design calls for 460 (orders/promo codes) or 520 (products). */
  width?: number;
  title?: ReactNode;
  /** Rendered next to the close button, e.g. status pill, prev/next nav. */
  headerExtra?: ReactNode;
  children: ReactNode;
}

export function Drawer({ open, onClose, width = 460, title, headerExtra, children }: DrawerProps) {
  const portalRoot = useAdminPortalRoot();
  const { shouldRender, isVisible } = useMountTransition(open, TRANSITION_MS);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      // Never steal Escape from a nested input/select that wants it (e.g. a
      // date picker) -- only close when nothing more specific already did.
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!shouldRender || !portalRoot) return null;

  return createPortal(
    <div className="fixed inset-0 z-40">
      {/* Dimming backdrop is deliberately always-dark (not `bg-ink`, which
          flips light in dark mode and would light up the page behind the
          drawer instead of dimming it). Fades in/out in step with the panel
          below -- same duration, so neither jumps ahead of the other. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-[#14161a]/45 transition-opacity duration-300 ${
          isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`absolute inset-y-0 right-0 flex flex-col border-l border-border bg-bg shadow-[-16px_0_48px_rgba(20,22,26,0.12)] transition-transform duration-300 ${
          isVisible ? "translate-x-0 ease-out" : "translate-x-full ease-in"
        }`}
        style={{ width }}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">{title}</div>
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть (esc)"
            title="Закрыть (esc)"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    portalRoot
  );
}
