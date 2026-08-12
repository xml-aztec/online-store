import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type AdminTelegramLinkResponse = components["schemas"]["AdminTelegramLinkResponse"];

export async function createTelegramLink(): Promise<AdminTelegramLinkResponse> {
  return apiFetch<AdminTelegramLinkResponse>("/admin/telegram/link", { method: "POST" });
}
