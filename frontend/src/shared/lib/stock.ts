export const LOW_STOCK_THRESHOLD = 5;

export function stockLabel(stockQty: number, isAvailable: boolean): string {
  if (!isAvailable || stockQty <= 0) return "Нет в наличии";
  if (stockQty <= LOW_STOCK_THRESHOLD) return `Осталось ${stockQty} шт.`;
  return "В наличии";
}

export function isLowStock(stockQty: number, isAvailable: boolean): boolean {
  return isAvailable && stockQty > 0 && stockQty <= LOW_STOCK_THRESHOLD;
}
