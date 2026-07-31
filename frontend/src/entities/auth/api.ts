import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type TokenResponse = components["schemas"]["TokenResponse"];
export type UserPublic = components["schemas"]["UserPublic"];

export async function login(email: string, password: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function refreshSession(): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/refresh", { method: "POST" });
}

export async function logoutRequest(): Promise<void> {
  await apiFetch<void>("/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<UserPublic> {
  return apiFetch<UserPublic>("/me");
}
