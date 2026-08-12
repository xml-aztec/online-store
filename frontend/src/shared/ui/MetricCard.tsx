import { ArrowDown, ArrowUp } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  /** Percent change vs. the previous equivalent period; omitted when there's
   * nothing to compare against (e.g. previous period had zero orders). */
  deltaPercent?: number | null;
  caption?: string;
}

export function MetricCard({ label, value, deltaPercent, caption }: MetricCardProps) {
  const hasDelta = deltaPercent != null && Number.isFinite(deltaPercent);
  const isUp = hasDelta && deltaPercent > 0;
  const isDown = hasDelta && deltaPercent < 0;

  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-ink">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {hasDelta && (
          <span
            className={`flex items-center gap-0.5 font-mono text-xs font-semibold ${
              isUp ? "text-success-700" : isDown ? "text-accent-sale-700" : "text-ink-muted"
            }`}
          >
            {isUp && <ArrowUp className="h-3 w-3" aria-hidden="true" />}
            {isDown && <ArrowDown className="h-3 w-3" aria-hidden="true" />}
            {deltaPercent > 0 ? "+" : ""}
            {deltaPercent.toFixed(0)}%
          </span>
        )}
        {caption && <span className="text-xs text-ink-muted">{caption}</span>}
      </div>
    </div>
  );
}
