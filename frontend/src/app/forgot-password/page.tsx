"use client";

import Link from "next/link";
import { useState } from "react";

import { forgotPassword } from "@/entities/auth/api";
import { ApiError } from "@/shared/api/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await forgotPassword(email);
      // ТЗ 5.5: the backend always responds 200 without revealing whether the
      // email exists -- show its message verbatim rather than assuming success.
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отправить запрос");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="mb-6 font-display text-xl font-bold text-ink">
        Восстановление пароля
      </h1>
      {message ? (
        <p className="max-w-sm text-center text-sm text-ink-muted">{message}</p>
      ) : (
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
          {error && <p className="text-sm text-accent-sale-700">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-brand hover:bg-brand/90 px-4 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Отправляем…" : "Отправить письмо"}
          </button>
        </form>
      )}
      <Link
        href="/login"
        className="mt-6 text-sm text-ink-muted hover:text-ink"
      >
        Назад ко входу
      </Link>
    </div>
  );
}
