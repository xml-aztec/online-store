"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

import { useAdminPortalRoot } from "@/shared/lib/adminPortalContext";

interface ShortcutsCheatsheetProps {
  open: boolean;
  onClose: () => void;
}

const GLOBAL_SHORTCUTS: [string, string][] = [
  ["Команды / поиск", "⌘K"],
  ["Дашборд / Заказы / Товары", "G D·O·P"],
  ["Шпаргалка", "?"],
];

const TABLE_SHORTCUTS: [string, string][] = [
  ["Строка вверх/вниз", "↑ ↓"],
  ["Открыть", "↵"],
  ["Выбрать строку", "X"],
  ["Инлайн-правка ячейки", "E"],
];

export function ShortcutsCheatsheet({ open, onClose }: ShortcutsCheatsheetProps) {
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
    <div className="fixed inset-0 z-50 flex justify-center px-4 pt-[14vh]">
      {/* Deliberately always-dark, not `bg-ink` -- see Drawer.tsx's backdrop
          comment for why. */}
      <div aria-hidden="true" className="absolute inset-0 bg-[#14161a]/45" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Горячие клавиши"
        className="relative flex h-fit w-full max-w-[480px] flex-col gap-3.5 rounded-xl bg-bg p-5 shadow-[0_24px_64px_rgba(20,22,26,0.22)]"
      >
        <div className="flex items-center justify-between">
          <span className="font-display text-[15px] font-extrabold text-ink">Клавиши</span>
          <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
            esc
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 text-xs">
          <ShortcutGroup title="Глобальные" rows={GLOBAL_SHORTCUTS} />
          <ShortcutGroup title="В таблице" rows={TABLE_SHORTCUTS} />
        </div>
      </div>
    </div>,
    portalRoot
  );
}

function ShortcutGroup({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </span>
      {rows.map(([label, keys]) => (
        <span key={label} className="flex items-center justify-between gap-3">
          <span className="text-ink">{label}</span>
          <span className="font-mono text-ink">{keys}</span>
        </span>
      ))}
    </div>
  );
}
