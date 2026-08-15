"use client";

import { AlertCircle, Check } from "lucide-react";
import { createPortal } from "react-dom";

import { useToastStore } from "@/entities/toast/store";
import { useAdminPortalRoot } from "@/shared/lib/adminPortalContext";

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
        <div
          key={item.id}
          role="status"
          className={`pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13px] font-medium shadow-[0_12px_32px_rgba(20,22,26,0.25)] ${
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
            onClick={() => dismiss(item.id)}
            aria-label="Скрыть уведомление"
            className="ml-1 text-white/70 hover:text-white"
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    portalRoot
  );
}
