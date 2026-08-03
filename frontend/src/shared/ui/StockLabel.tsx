import { isLowStock, stockLabel } from "@/shared/lib/stock";

interface StockLabelProps {
  stockQty: number;
  isAvailable: boolean;
}

export function StockLabel({ stockQty, isAvailable }: StockLabelProps) {
  if (!isAvailable || stockQty <= 0) return null;

  const low = isLowStock(stockQty, isAvailable);

  return (
    <span className={`text-xs font-semibold ${low ? "text-accent-sale-700" : "text-success-700"}`}>
      {stockLabel(stockQty, isAvailable)}
    </span>
  );
}
