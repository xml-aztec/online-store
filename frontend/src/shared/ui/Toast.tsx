"use client";

import { AlertCircle, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useToastStore, type ToastItem } from "@/entities/toast/store";
import { useAdminPortalRoot } from "@/shared/lib/adminPortalContext";
import { useMountTransition } from "@/shared/lib/useMountTransition";

const AUTO_DISMISS_MS = 4000;
const TRANSITION_MS = 200;

function ToastEntry({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [active, setActive] = useState(true);
  const { shouldRender, isVisible } = useMountTransition(active, TRANSITION_MS);

  useEffect(() => {
    const timeout = setTimeout(() => setActive(false), AUTO_DISMISS_MS);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!shouldRender) onDismiss(item.id);
  }, [shouldRender, item.id, onDismiss]);

  if (!shouldRender) return null;

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13px] font-medium shadow-[0_12px_32px_rgba(20,22,26,0.25)] transition-[opacity,transform] duration-200 ${
        isVisible ? "translate-y-0 opacity-100 ease-out" : "translate-y-2 opacity-0 ease-in"
      } ${
        // Success toasts are deliberately always-dark, not `bg-ink` (which
        // flips light in dark mode and would leave the white text and
        // dismiss button unreadable). Error keeps `bg-accent-sale`, which
        // is already theme-invariant for admin (pinned in .admin-shell).
        item.variant === "error" ? "bg-accent-sale text-white" : "bg-[#14161a] text-white"
      }`}
    >
      {item.variant === "error" ? (
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <Check className="h-4 w-4 shrink-0 text-[#4ADE80]" aria-hidden="true" strokeWidth={2.4} />
      )}
      {item.message}
      <button
        type="button"
        onClick={() => setActive(false)}
        aria-label="Скрыть уведомление"
        className="ml-1 text-white/70 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}

/** Rendered once by AdminLayout; subscribes to the shared toast store so any
 * component can call useToastStore.getState().push(...) without prop-drilling. */
export function ToastStack() {
  const items = useToastStore((state) => state.items);
  const dismiss = useToastStore((state) => state.dismiss);
  const portalRoot = useAdminPortalRoot();

  if (!portalRoot || items.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2">
      {items.map((item) => (
        <ToastEntry key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </div>,
    portalRoot
  );
}
