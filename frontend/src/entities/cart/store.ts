"use client";

import { create } from "zustand";

// Local-only placeholder until the real cart API lands (see plan-razrabotki.md
// Задачи 3.1/3.3) -- gives the header a counter to show without inventing
// backend calls that don't exist yet.
interface CartState {
  itemCount: number;
  increment: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  itemCount: 0,
  increment: () => set((state) => ({ itemCount: state.itemCount + 1 })),
}));
