import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type CheckoutRequest = components["schemas"]["CheckoutRequest"];
export type CheckoutResponse = components["schemas"]["CheckoutResponse"];
export type OrderPublic = components["schemas"]["OrderPublic"];
export type CheckoutConfig = components["schemas"]["CheckoutConfigResponse"];

export async function getCheckoutConfig(): Promise<CheckoutConfig> {
  return apiFetch<CheckoutConfig>("/checkout/config");
}

export async function checkout(payload: CheckoutRequest): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>("/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getOrderByNumber(number: string, email: string): Promise<OrderPublic> {
  const query = new URLSearchParams({ email });
  return apiFetch<OrderPublic>(`/orders/${encodeURIComponent(number)}?${query.toString()}`);
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает подтверждения",
  awaiting_payment: "Ожидает оплаты",
  paid: "Оплачен",
  processing: "Собирается",
  shipped: "Отправлен",
  delivered: "Доставлен",
  cancelled: "Отменён",
  refunded: "Возврат оформлен",
};
