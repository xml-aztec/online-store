const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "2 мин" / "3 ч" / "вчера" / "12.08" -- used wherever the v2 admin design
 * shows a compact "time since" column (dashboard feed, orders table). */
export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const diff = Date.now() - date.getTime();

  if (diff < MINUTE) return "сейчас";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} мин`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} ч`;
  if (diff < 2 * DAY) return "вчера";
  if (diff < 6 * DAY) return `${Math.floor(diff / DAY)} дн`;

  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}
