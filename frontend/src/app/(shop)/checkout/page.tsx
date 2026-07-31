import type { Metadata } from "next";

import { CheckoutForm } from "@/widgets/CheckoutForm";

export const metadata: Metadata = {
  title: "Оформление заказа",
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        Оформление заказа
      </h1>
      <CheckoutForm />
    </div>
  );
}
