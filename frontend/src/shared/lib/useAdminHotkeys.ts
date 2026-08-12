"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const GO_TO_ROUTES: Record<string, string> = {
  d: "/admin",
  o: "/admin/orders",
  p: "/admin/products",
};

const GO_TO_CHORD_TIMEOUT_MS = 600;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

interface UseAdminHotkeysOptions {
  onOpenPalette: () => void;
  onOpenCheatsheet: () => void;
}

/** Global admin shortcuts (ТЗ design "Каркас" doc): ⌘K/Ctrl+K opens the
 * command palette from anywhere including inputs (matches how every app with
 * a palette treats it); "G then D/O/P" (go-to) and "?" (cheatsheet) are
 * suppressed while the user is actually typing so they don't hijack normal
 * text entry. Mounted once by AdminLayout, so it's live on every /admin/*
 * page regardless of which one is currently rendered. */
export function useAdminHotkeys({ onOpenPalette, onOpenCheatsheet }: UseAdminHotkeysOptions): void {
  const router = useRouter();
  const awaitingGoTo = useRef(false);
  const goToTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearGoTo() {
      awaitingGoTo.current = false;
      if (goToTimer.current) clearTimeout(goToTimer.current);
    }

    function onKeyDown(event: KeyboardEvent) {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isCmdK) {
        event.preventDefault();
        clearGoTo();
        onOpenPalette();
        return;
      }

      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

      if (awaitingGoTo.current) {
        clearGoTo();
        const route = GO_TO_ROUTES[event.key.toLowerCase()];
        if (route) {
          event.preventDefault();
          router.push(route);
        }
        return;
      }

      if (event.key.toLowerCase() === "g") {
        awaitingGoTo.current = true;
        goToTimer.current = setTimeout(clearGoTo, GO_TO_CHORD_TIMEOUT_MS);
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        onOpenCheatsheet();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearGoTo();
    };
  }, [router, onOpenPalette, onOpenCheatsheet]);
}
