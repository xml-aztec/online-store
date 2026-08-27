import { ORDER_STATUS_LABELS } from "@/entities/orders/api";
import { orderStatusPillClass } from "@/shared/lib/orderStatusStyles";

interface StatusPillProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusPill({ status, size = "sm" }: StatusPillProps) {
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span
      className={`whitespace-nowrap rounded-full border font-medium ${sizeClasses} ${orderStatusPillClass(status)}`}
    >
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}
