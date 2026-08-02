"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { resetPassword } from "@/entities/auth/api";
import { ApiError } from "@/shared/api/client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await resetPassword(token, password);
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сбросить пароль");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <p className="max-w-sm text-center text-sm text-accent-sale-700">
        Ссылка неполная — не хватает токена. Запросите восстановление пароля заново.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div>
        <label htmlFor="password" className="mb-1 block text-sm text-ink-muted">
          Новый пароль
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm bg-bg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <p className="mt-1 text-xs text-ink-muted">Минимум 8 символов</p>
      </div>
      {error && <p className="text-sm text-accent-sale-700">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-brand hover:bg-brand/90 px-4 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Сохраняем…" : "Сохранить новый пароль"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="mb-6 font-display text-xl font-bold text-ink">
        Новый пароль
      </h1>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
      <Link
        href="/login"
        className="mt-6 text-sm text-ink-muted hover:text-ink"
      >
        Назад ко входу
      </Link>
    </div>
  );
}
