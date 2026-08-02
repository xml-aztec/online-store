"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { login } from "@/entities/auth/api";
import { establishSession, useAuthStore } from "@/entities/auth/store";
import { ApiError } from "@/shared/api/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const tokenResponse = await login(email, password);
      await establishSession(tokenResponse);
      const role = useAuthStore.getState().role;
      const defaultDestination = role === "manager" || role === "admin" ? "/admin" : "/account";
      router.push(searchParams.get("redirect") ?? defaultDestination);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось войти");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-ink-muted">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm bg-bg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm text-ink-muted">
          Пароль
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm bg-bg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
      {error && <p className="text-sm text-accent-sale-700">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-brand hover:bg-brand/90 px-4 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Входим…" : "Войти"}
      </button>
      <p className="text-center text-sm text-ink-muted">
        <Link href="/forgot-password" className="underline hover:text-ink">
          Забыли пароль?
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="mb-6 font-display text-xl font-bold text-ink">
        Вход — HobbyLife
      </h1>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-sm text-ink-muted">
        Нет аккаунта?{" "}
        <Link href="/register" className="text-ink underline">
          Зарегистрироваться
        </Link>
      </p>
      <Link
        href="/"
        className="mt-4 text-sm text-ink-muted hover:text-ink"
      >
        На главную
      </Link>
    </div>
  );
}
