import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type AdminPromoMessage = components["schemas"]["AdminPromoMessagePublic"];
export type AdminPromoMessageUpdate = components["schemas"]["AdminPromoMessageUpdate"];

export async function listAdminPromoMessages(): Promise<AdminPromoMessage[]> {
  return apiFetch<AdminPromoMessage[]>("/admin/promo-messages");
}

export async function createAdminPromoMessage(message: string): Promise<AdminPromoMessage> {
  return apiFetch<AdminPromoMessage>("/admin/promo-messages", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function updateAdminPromoMessage(
  messageId: string,
  payload: AdminPromoMessageUpdate
): Promise<AdminPromoMessage> {
  return apiFetch<AdminPromoMessage>(`/admin/promo-messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function reorderAdminPromoMessages(
  messageIds: string[]
): Promise<AdminPromoMessage[]> {
  return apiFetch<AdminPromoMessage[]>("/admin/promo-messages/reorder", {
    method: "PATCH",
    body: JSON.stringify({ promo_message_ids: messageIds }),
  });
}

export async function deleteAdminPromoMessage(messageId: string): Promise<void> {
  await apiFetch<void>(`/admin/promo-messages/${messageId}`, { method: "DELETE" });
}
