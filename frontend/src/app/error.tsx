"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-zinc-500">500</p>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Что-то пошло не так
      </h1>
      <p className="max-w-md text-zinc-500">
        Мы уже знаем о проблеме. Попробуйте обновить страницу или вернуться позже.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Попробовать снова
      </button>
    </div>
  );
}
