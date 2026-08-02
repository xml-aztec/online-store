import { Baby, Bath, Box, ChefHat, Sparkles, type LucideIcon } from "lucide-react";

// Category names are free-text (see backend/app/imports/service.py's "Хранение
// и уборка/Тазики" example), not a fixed enum, so this is a best-effort
// keyword match with a neutral fallback rather than a strict lookup.
const KEYWORD_ICONS: [string, LucideIcon][] = [
  ["кухн", ChefHat],
  ["ванн", Bath],
  ["хран", Box],
  ["дет", Baby],
  ["убор", Sparkles],
];

export function resolveCategoryIcon(name: string): LucideIcon {
  const lower = name.toLowerCase();
  for (const [keyword, icon] of KEYWORD_ICONS) {
    if (lower.includes(keyword)) return icon;
  }
  return Box;
}
