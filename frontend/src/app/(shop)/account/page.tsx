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
    return <p className="text-zinc-500">Загрузка…</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Профиль</h1>
      <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">Email</label>
          <input
            value={email ?? ""}
            disabled
            className="w-full rounded border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label htmlFor="fullName" className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
            Имя
          </label>
          <input
            id="fullName"
            value={fullName ?? me.full_name ?? ""}
            onChange={(event) => setFullName(event.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
            Телефон
          </label>
          <input
            id="phone"
            value={phone ?? me.phone ?? ""}
            onChange={(event) => setPhone(event.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {mutation.isPending ? "Сохраняем…" : saved ? "Сохранено ✓" : "Сохранить"}
        </button>
        {mutation.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {mutation.error instanceof ApiError ? mutation.error.message : "Не удалось сохранить"}
          </p>
        )}
      </form>
    </div>
  );
}
