"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { login, register } from "@/entities/auth/api";
import { establishSession, useAuthStore } from "@/entities/auth/store";
import { ApiError } from "@/shared/api/client";
import { safeRedirectPath } from "@/shared/lib/safeRedirectPath";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = useAuthStore((state) => state.status);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loginFailedAfterRegister, setLoginFailedAfterRegister] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Someone already signed in has no business seeing the registration form
  // -- submitting it would silently switch their session to a brand-new
  // account with no warning. Send them home instead (mirrors the
  // authenticated-guard in account/layout.tsx and admin/layout.tsx).
  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoginFailedAfterRegister(false);
    setIsSubmitting(true);
    try {
      await register(email, password, fullName);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось зарегистрироваться");
      setIsSubmitting(false);
      return;
    }
    try {
      // ТЗ 5.5: registration doesn't require email confirmation to shop --
      // log the new account in immediately rather than making them re-enter.
      const tokenResponse = await login(email, password);
      await establishSession(tokenResponse);
      router.push(safeRedirectPath(searchParams.get("redirect"), "/"));
    } catch {
      // The account was already created above -- a generic "registration
      // failed" message here would be wrong and would send a retry into
      // EMAIL_ALREADY_REGISTERED. Point at manual login instead.
      setLoginFailedAfterRegister(true);
      setIsSubmitting(false);
    }
  }

  if (status !== "anonymous") return null;

  const redirect = searchParams.get("redirect");
  const loginHref = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login";

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div>
        <label htmlFor="fullName" className="mb-1 block text-sm text-ink-muted">
          Имя
        </label>
        <input
          id="fullName"
          type="text"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm bg-bg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
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
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm bg-bg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <p className="mt-1 text-xs text-ink-muted">Минимум 8 символов</p>
      </div>
      {error && <p className="text-sm text-accent-sale-700">{error}</p>}
      {loginFailedAfterRegister && (
        <p className="text-sm text-accent-sale-700">
          Аккаунт создан, но не удалось войти автоматически.{" "}
          <Link href={loginHref} className="underline">
            Войдите вручную
          </Link>
          .
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-brand hover:bg-brand/90 px-4 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Регистрируем…" : "Зарегистрироваться"}
      </button>
    </form>
  );
}

function LoginLink() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const href = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login";

  return (
    <Link href={href} className="text-ink underline">
      Войти
    </Link>
  );
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="mb-6 font-display text-xl font-bold text-ink">
        Регистрация — HobbyLife
      </h1>
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
      <p className="mt-6 text-sm text-ink-muted">
        Уже есть аккаунт?{" "}
        <Suspense fallback={<Link href="/login" className="text-ink underline">Войти</Link>}>
          <LoginLink />
        </Suspense>
      </p>
    </div>
  );
}
