"use client";

import { AlertTriangle } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { useAdminPortalRoot } from "@/shared/lib/adminPortalContext";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Отмена",
  danger = true,
  pending = false,
  onConfirm,
  onClose,
  children,
}: ConfirmDialogProps) {
  const portalRoot = useAdminPortalRoot();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !portalRoot) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-center px-4 pt-[16vh]">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/45" onClick={onClose} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-fit w-full max-w-[420px] flex-col gap-3.5 rounded-xl bg-bg p-[22px] shadow-[0_24px_64px_rgba(20,22,26,0.3)]"
      >
        <div className="flex items-center gap-2.5">
          {danger && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-sale/10">
              <AlertTriangle className="h-[18px] w-[18px] text-accent-sale" aria-hidden="true" strokeWidth={2.2} />
            </span>
          )}
          <span className="font-display text-base font-extrabold text-ink">{title}</span>
        </div>
        <div className="text-[13px] leading-[1.55] text-ink-muted">{description}</div>
        {children}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface px-4 py-2.5 font-display text-[13px] font-semibold text-ink hover:bg-border/60"
          >
            {cancelLabel} <span className="font-mono text-[10px] text-ink-muted">esc</span>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2.5 font-display text-[13px] font-bold text-white disabled:opacity-50 ${
              danger ? "bg-accent-sale hover:bg-accent-sale/90" : "bg-brand hover:bg-brand/90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    portalRoot
  );
}
