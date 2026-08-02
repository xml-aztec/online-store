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
