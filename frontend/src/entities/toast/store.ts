"use client";

import { create } from "zustand";

export interface ToastItem {
  id: string;
  message: string;
  variant: "success" | "error";
}

interface ToastState {
  items: ToastItem[];
  push: (message: string, variant?: ToastItem["variant"]) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (message, variant = "success") => {
    const id = crypto.randomUUID();
    set((state) => ({ items: [...state.items, { id, message, variant }] }));
  },
  // Auto-dismiss timing + the exit-transition delay both live in
  // shared/ui/Toast.tsx now, not here -- dismiss() removes the item from
  // this array immediately when called, so the caller (the toast's own
  // mount-transition lifecycle) is responsible for waiting until its fade-out
  // has actually played before calling this.
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}));
