import { Star } from "lucide-react";

interface RatingRowProps {
  ratingAvg: number | null;
  ratingCount: number;
  size?: "sm" | "md";
}

export function RatingRow({ ratingAvg, ratingCount, size = "sm" }: RatingRowProps) {
  if (ratingCount === 0 || ratingAvg === null) return null;

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div className="flex items-center gap-1.5">
      <Star className={`${iconSize} fill-ink text-ink`} aria-hidden="true" />
      <span className={`font-mono ${textSize} font-semibold text-ink`}>
        {ratingAvg.toFixed(1)}
      </span>
      <span className={`font-mono ${textSize} text-ink-muted`}>({ratingCount})</span>
    </div>
  );
}
