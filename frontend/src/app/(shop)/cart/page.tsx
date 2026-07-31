import type { Metadata } from "next";

import { CartView } from "@/widgets/CartView";

export const metadata: Metadata = {
  title: "Корзина",
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Корзина</h1>
      <CartView />
    </div>
  );
}
