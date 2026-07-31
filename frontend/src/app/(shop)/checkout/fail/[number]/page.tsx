import type { Metadata } from "next";

import { OrderStatusResult } from "@/widgets/OrderStatusResult";

export const metadata: Metadata = {
  title: "Не удалось оплатить заказ",
};

interface PageProps {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ email?: string }>;
}

export default async function CheckoutFailPage({ params, searchParams }: PageProps) {
  const { number } = await params;
  const { email } = await searchParams;

  return (
    <OrderStatusResult
      number={number}
      email={email}
      heading="Не удалось завершить оплату"
      description="Попробуйте оплатить ещё раз или свяжитесь с нами."
    />
  );
}
