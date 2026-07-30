const CURRENCY_LABEL = "сом";

/** Formats amounts the way the store expects: "1 250 сом" (no cents unless present). */
export function formatPrice(value: string | number): string {
  const amount = typeof value === "string" ? Number(value) : value;
  const hasFraction = Math.round(amount * 100) % 100 !== 0;

  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);

  return `${formatted} ${CURRENCY_LABEL}`;
}
