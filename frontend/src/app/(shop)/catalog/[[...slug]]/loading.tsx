export default function CatalogLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8" aria-busy="true" aria-label="Загрузка каталога">
      <div className="h-4 w-40 animate-pulse rounded bg-surface" />
      <div className="mt-3 h-7 w-56 animate-pulse rounded bg-surface" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr] lg:gap-8">
        <aside className="hidden space-y-4 lg:block">
          <div className="h-48 animate-pulse rounded-xl bg-surface" />
          <div className="h-72 animate-pulse rounded-xl bg-surface" />
        </aside>

        <div>
          <div className="mb-4 h-6 w-32 animate-pulse rounded bg-surface" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-ink/10">
                <div className="aspect-square animate-pulse bg-surface" />
                <div className="space-y-2 p-3">
                  <div className="h-3 w-full animate-pulse rounded bg-surface" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-surface" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-surface" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
