"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { useAdminPortalRoot } from "@/shared/lib/adminPortalContext";

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

  if (!open || !portalRoot) return null;

  return createPortal(
    <div className="fixed inset-0 z-40">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/45" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex flex-col border-l border-border bg-bg shadow-[-16px_0_48px_rgba(20,22,26,0.12)]"
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
