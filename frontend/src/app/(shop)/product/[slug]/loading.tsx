export default function ProductLoading() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8" aria-busy="true" aria-label="Загрузка товара">
      <div className="mb-6 h-4 w-40 animate-pulse rounded bg-surface" />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="aspect-square w-full animate-pulse rounded-xl bg-surface" />
        <div className="space-y-4">
          <div className="h-8 w-3/4 animate-pulse rounded bg-surface" />
          <div className="h-7 w-1/3 animate-pulse rounded bg-surface" />
          <div className="h-24 w-full animate-pulse rounded bg-surface" />
          <div className="h-12 w-full animate-pulse rounded-lg bg-surface" />
        </div>
      </div>
    </div>
  );
}
