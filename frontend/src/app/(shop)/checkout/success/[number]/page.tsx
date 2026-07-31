import type { Metadata } from "next";

import { OrderStatusResult } from "@/widgets/OrderStatusResult";

export const metadata: Metadata = {
  title: "Заказ оформлен",
};

interface PageProps {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ email?: string }>;
}

export default async function CheckoutSuccessPage({ params, searchParams }: PageProps) {
  const { number } = await params;
  const { email } = await searchParams;

  return (
    <OrderStatusResult
      number={number}
      email={email}
      heading="Спасибо за заказ!"
      description="Мы начали обработку вашего заказа."
    />
  );
}
