import type { Metadata } from "next";

import { CartView } from "@/widgets/CartView";

export const metadata: Metadata = {
  title: "Корзина",
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8">
      <h1 className="mb-6 font-display text-xl font-bold text-ink">Корзина</h1>
      <CartView />
    </div>
  );
}
