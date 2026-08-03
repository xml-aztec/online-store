interface TimelineItem {
  label: string;
  timestamp: string;
  description?: string;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={index} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-success ring-4 ring-success/15" />
              {!isLast && <span className="w-0.5 flex-1 bg-ink/10" style={{ minHeight: 20 }} />}
            </div>
            <div className={`flex flex-col gap-0.5 ${isLast ? "" : "pb-3"}`}>
              <span className="text-sm font-semibold text-ink">{item.label}</span>
              <span className="font-mono text-xs text-ink-muted">{item.timestamp}</span>
              {item.description && (
                <span className="text-xs text-ink-muted">{item.description}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
