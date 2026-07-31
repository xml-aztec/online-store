"use client";

import { create } from "zustand";

import { getMe, logoutRequest, refreshSession, type TokenResponse } from "@/entities/auth/api";
import { setAccessToken } from "@/shared/api/client";

interface AuthState {
  role: string | null;
  email: string | null;
  fullName: string | null;
  status: "loading" | "authenticated" | "anonymous";
  setSession: (params: { role: string; email: string; fullName: string | null }) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  role: null,
  email: null,
  fullName: null,
  status: "loading",
  setSession: ({ role, email, fullName }) =>
    set({ role, email, fullName, status: "authenticated" }),
  clear: () => {
    setAccessToken(null);
    set({ role: null, email: null, fullName: null, status: "anonymous" });
  },
}));

export async function establishSession(tokenResponse: TokenResponse): Promise<void> {
  setAccessToken(tokenResponse.access_token);
  const me = await getMe();
  useAuthStore
    .getState()
    .setSession({ role: me.role, email: me.email, fullName: me.full_name });
}

let bootstrapped = false;

// ТЗ 5.5: the access token lives only in frontend memory, so a page reload
// loses it -- silently exchange the httpOnly refresh cookie for a fresh one
// once when the app mounts (app/providers.tsx) instead of forcing a re-login.
export async function bootstrapSession(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  try {
    const tokenResponse = await refreshSession();
    await establishSession(tokenResponse);
  } catch {
    useAuthStore.getState().clear();
  }
}

export async function logout(): Promise<void> {
  try {
    await logoutRequest();
  } finally {
    useAuthStore.getState().clear();
  }
}
