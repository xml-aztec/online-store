import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type CheckoutRequest = components["schemas"]["CheckoutRequest"];
export type CheckoutResponse = components["schemas"]["CheckoutResponse"];
export type OrderPublic = components["schemas"]["OrderPublic"];
export type OrderListItem = components["schemas"]["OrderListItem"];
export type OrderListResponse = components["schemas"]["OrderListResponse"];
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

export async function listMyOrders(page = 1, pageSize = 20): Promise<OrderListResponse> {
  return apiFetch<OrderListResponse>(`/me/orders?page=${page}&page_size=${pageSize}`);
}

export async function getMyOrder(number: string): Promise<OrderPublic> {
  return apiFetch<OrderPublic>(`/me/orders/${encodeURIComponent(number)}`);
}

export async function cancelMyOrder(number: string): Promise<OrderPublic> {
  return apiFetch<OrderPublic>(`/me/orders/${encodeURIComponent(number)}/cancel`, {
    method: "POST",
  });
}

export const DELIVERY_METHOD_LABELS: Record<string, string> = {
  pickup: "самовывоз",
  courier: "доставка курьером",
};

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
