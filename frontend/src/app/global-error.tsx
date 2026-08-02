"use client";

// Only catches errors thrown by the root layout itself (rare) -- Next.js
// requires this to render its own <html>/<body> since it replaces the layout
// that would normally provide them. Ordinary page/route errors are handled by
// error.tsx instead.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-sm font-medium text-ink-muted">500</p>
          <h1 className="font-display text-2xl font-bold text-ink">Что-то пошло не так</h1>
          <p className="max-w-md text-ink-muted">
            Мы уже знаем о проблеме. Попробуйте обновить страницу или вернуться позже.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 rounded-full bg-brand hover:bg-brand/90 px-6 py-3 text-sm font-medium text-white"
          >
            Попробовать снова
          </button>
        </div>
      </body>
    </html>
  );
}
