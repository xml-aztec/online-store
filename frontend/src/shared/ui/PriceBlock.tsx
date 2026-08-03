import { formatPrice } from "@/shared/lib/formatPrice";

interface PriceBlockProps {
  price: string | number;
  compareAtPrice?: string | number | null;
  size?: "sm" | "md" | "lg";
}

const PRICE_SIZE = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
} as const;

const COMPARE_SIZE = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
} as const;

export function PriceBlock({ price, compareAtPrice, size = "sm" }: PriceBlockProps) {
  const hasCompare = compareAtPrice != null && Number(compareAtPrice) > Number(price);

  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className={`font-mono font-bold text-ink ${PRICE_SIZE[size]}`}>
        {formatPrice(price)}
      </span>
      {hasCompare && (
        <span className={`font-mono text-ink-muted line-through ${COMPARE_SIZE[size]}`}>
          {formatPrice(compareAtPrice as string | number)}
        </span>
      )}
    </div>
  );
}
