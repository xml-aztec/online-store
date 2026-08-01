import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type TokenResponse = components["schemas"]["TokenResponse"];
export type UserPublic = components["schemas"]["UserPublic"];
export type MessageResponse = components["schemas"]["MessageResponse"];

export async function login(email: string, password: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(
  email: string,
  password: string,
  fullName: string
): Promise<UserPublic> {
  return apiFetch<UserPublic>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
}

export async function forgotPassword(email: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<MessageResponse> {
  return apiFetch<MessageResponse>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export async function verifyEmail(token: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
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
