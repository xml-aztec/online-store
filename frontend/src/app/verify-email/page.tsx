"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { verifyEmail } from "@/entities/auth/api";
import { ApiError } from "@/shared/api/client";

type Status = "verifying" | "success" | "error";

function VerifyEmailStatus() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    verifyEmail(token)
      .then((response) => {
        setStatus("success");
        setMessage(response.message);
      })
      .catch((err: unknown) => {
        setStatus("error");
        setMessage(err instanceof ApiError ? err.message : "Не удалось подтвердить email");
      });
  }, [token]);

  if (!token) {
    return (
      <p className="text-sm text-accent-sale-700">
        Ссылка неполная — не хватает токена.
      </p>
    );
  }

  if (status === "verifying") {
    return <p className="text-sm text-ink-muted">Подтверждаем email…</p>;
  }

  return (
    <p
      className={
        status === "success"
          ? "text-sm text-ink-muted "
          : "text-sm text-accent-sale-700 "
      }
    >
      {message}
    </p>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-6 font-display text-xl font-bold text-ink">
        Подтверждение email
      </h1>
      <Suspense fallback={<p className="text-sm text-ink-muted">Подтверждаем email…</p>}>
        <VerifyEmailStatus />
      </Suspense>
      <Link
        href="/"
        className="mt-6 text-sm text-ink-muted hover:text-ink"
      >
        На главную
      </Link>
    </div>
  );
}
