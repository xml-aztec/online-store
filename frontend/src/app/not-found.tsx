import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-ink-muted">404</p>
      <h1 className="font-display text-2xl font-bold text-ink">
        Страница не найдена
      </h1>
      <p className="max-w-md text-ink-muted">
        Возможно, ссылка устарела или страница была перемещена.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-brand hover:bg-brand/90 px-6 py-3 text-sm font-medium text-white"
      >
        На главную
      </Link>
    </div>
  );
}
