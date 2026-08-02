"use client";

import { useState } from "react";

import { getMe } from "@/entities/auth/api";
import { useAuthStore } from "@/entities/auth/store";
import { updateProfile } from "@/entities/account/api";
import { ApiError } from "@/shared/api/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export default function AccountProfilePage() {
  const queryClient = useQueryClient();
  const email = useAuthStore((state) => state.email);
  const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const [fullName, setFullName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      updateProfile({
        full_name: fullName ?? me?.full_name ?? undefined,
        phone: phone ?? undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  if (isLoading || !me) {
    return <p className="text-ink-muted">Загрузка…</p>;
  }

  return (
    <div>
      <h1 className="mb-6 font-display text-xl font-bold text-ink">Профиль</h1>
      <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
        <div>
          <label className="mb-1 block text-sm text-ink-muted">Email</label>
          <input
            value={email ?? ""}
            disabled
            className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm text-ink-muted"
          />
        </div>
        <div>
          <label htmlFor="fullName" className="mb-1 block text-sm text-ink-muted">
            Имя
          </label>
          <input
            id="fullName"
            value={fullName ?? me.full_name ?? ""}
            onChange={(event) => setFullName(event.target.value)}
            className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm bg-bg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm text-ink-muted">
            Телефон
          </label>
          <input
            id="phone"
            value={phone ?? me.phone ?? ""}
            onChange={(event) => setPhone(event.target.value)}
            className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm bg-bg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-brand hover:bg-brand/90 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {mutation.isPending ? "Сохраняем…" : saved ? "Сохранено ✓" : "Сохранить"}
        </button>
        {mutation.isError && (
          <p className="text-sm text-accent-sale-700">
            {mutation.error instanceof ApiError ? mutation.error.message : "Не удалось сохранить"}
          </p>
        )}
      </form>
    </div>
  );
}
