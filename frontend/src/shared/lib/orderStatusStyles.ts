const NEUTRAL = "border-ink/15 text-ink-muted";
const BRAND = "border-brand/30 bg-brand/10 text-brand";
const SUCCESS = "border-success/30 bg-success/10 text-success-700";
const SALE = "border-accent-sale/30 bg-accent-sale/10 text-accent-sale-700";

const STATUS_STYLES: Record<string, string> = {
  pending: NEUTRAL,
  awaiting_payment: NEUTRAL,
  paid: BRAND,
  processing: BRAND,
  shipped: BRAND,
  delivered: SUCCESS,
  cancelled: SALE,
  refunded: SALE,
};

export function orderStatusPillClass(status: string): string {
  return STATUS_STYLES[status] ?? NEUTRAL;
}

const DOT_STYLES: Record<string, string> = {
  pending: "bg-ink-muted ring-ink-muted/15",
  awaiting_payment: "bg-ink-muted ring-ink-muted/15",
  paid: "bg-brand ring-brand/15",
  processing: "bg-brand ring-brand/15",
  shipped: "bg-brand ring-brand/15",
  delivered: "bg-success ring-success/15",
  cancelled: "bg-accent-sale ring-accent-sale/15",
  refunded: "bg-accent-sale ring-accent-sale/15",
};

const LABEL_STYLES: Record<string, string> = {
  pending: "text-ink-muted",
  awaiting_payment: "text-ink-muted",
  paid: "text-brand",
  processing: "text-brand",
  shipped: "text-brand",
  delivered: "text-success-700",
  cancelled: "text-accent-sale-700",
  refunded: "text-accent-sale-700",
};

export function orderStatusDotClass(status: string): string {
  return DOT_STYLES[status] ?? "bg-ink-muted ring-ink-muted/15";
}

export function orderStatusLabelClass(status: string): string {
  return LABEL_STYLES[status] ?? "text-ink-muted";
}
