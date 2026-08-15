import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type PromoMessage = components["schemas"]["PromoMessagePublic"];

export async function getPromoMessages(): Promise<PromoMessage[]> {
  return apiFetch<PromoMessage[]>("/promo-messages", { next: { revalidate: 60 } });
}
