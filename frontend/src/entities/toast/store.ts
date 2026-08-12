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

const AUTO_DISMISS_MS = 4000;

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (message, variant = "success") => {
    const id = crypto.randomUUID();
    set((state) => ({ items: [...state.items, { id, message, variant }] }));
    setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
  },
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}));
