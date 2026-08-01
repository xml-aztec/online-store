import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-zinc-500">404</p>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Страница не найдена
      </h1>
      <p className="max-w-md text-zinc-500">
        Возможно, ссылка устарела или страница была перемещена.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        На главную
      </Link>
    </div>
  );
}
