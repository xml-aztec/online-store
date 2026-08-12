/** Russian countable-noun pluralization: 1 товар / 2 товара / 5 товаров.
 * The naive "n < 5" heuristic breaks on 11-14, which always take the "many"
 * form regardless of their last digit (11 товаров, not 11 товара). */
export function pluralizeRu(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
