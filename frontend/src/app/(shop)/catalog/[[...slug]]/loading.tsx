export default function CatalogLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="h-6 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-4">
          <div className="h-40 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-64 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        </aside>

        <div>
          <div className="mb-4 h-5 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
