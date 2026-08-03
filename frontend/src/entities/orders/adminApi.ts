import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type AdminOrderListItem = components["schemas"]["AdminOrderListItem"];
export type AdminOrderListResponse = components["schemas"]["AdminOrderListResponse"];
export type AdminOrderDetail = components["schemas"]["AdminOrderDetail"];
export type StatsSummaryResponse = components["schemas"]["StatsSummaryResponse"];
export type AdminOrderStatusCountsResponse =
  components["schemas"]["AdminOrderStatusCountsResponse"];

export interface AdminOrdersFilter {
  status?: string[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export async function listAdminOrders(
  filter: AdminOrdersFilter = {}
): Promise<AdminOrderListResponse> {
  const params = new URLSearchParams();
  for (const status of filter.status ?? []) params.append("status", status);
  if (filter.search) params.set("search", filter.search);
  if (filter.dateFrom) params.set("date_from", filter.dateFrom);
  if (filter.dateTo) params.set("date_to", filter.dateTo);
  if (filter.page) params.set("page", String(filter.page));
  if (filter.pageSize) params.set("page_size", String(filter.pageSize));
  const query = params.toString();
  return apiFetch<AdminOrderListResponse>(`/admin/orders${query ? `?${query}` : ""}`);
}

export async function getOrderStatusCounts(): Promise<AdminOrderStatusCountsResponse> {
  return apiFetch<AdminOrderStatusCountsResponse>("/admin/orders/status-counts");
}

export async function getAdminOrder(orderId: string): Promise<AdminOrderDetail> {
  return apiFetch<AdminOrderDetail>(`/admin/orders/${orderId}`);
}

export async function updateAdminOrderStatus(
  orderId: string,
  toStatus: string,
  comment?: string
): Promise<AdminOrderDetail> {
  return apiFetch<AdminOrderDetail>(`/admin/orders/${orderId}/status`, {
    method: "POST",
    body: JSON.stringify({ to_status: toStatus, comment: comment ?? null }),
  });
}

export async function refundAdminOrder(orderId: string): Promise<AdminOrderDetail> {
  return apiFetch<AdminOrderDetail>(`/admin/orders/${orderId}/refund`, { method: "POST" });
}

export async function getStatsSummary(): Promise<StatsSummaryResponse> {
  return apiFetch<StatsSummaryResponse>("/admin/stats/summary");
}
