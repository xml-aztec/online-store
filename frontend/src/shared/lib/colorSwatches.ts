import type { CSSProperties } from "react";

// Product "цвет" option values are free-text Russian color names entered by
// whoever imports the catalog (see backend/app/imports/service.py's example
// row), not a fixed enum -- this maps the common ones to a real swatch color
// so filters/variant pickers can render a circle instead of plain text.
const RU_COLOR_SWATCHES: Record<string, string> = {
  "белый": "#FFFFFF",
  "чёрный": "#14161A",
  "черный": "#14161A",
  "серый": "#9CA3AF",
  "красный": "#E53E3E",
  "синий": "#2F5AF5",
  "голубой": "#38BDF8",
  "зелёный": "#22C55E",
  "зеленый": "#22C55E",
  "жёлтый": "#FACC15",
  "желтый": "#FACC15",
  "оранжевый": "#F97316",
  "розовый": "#F472B6",
  "фиолетовый": "#A855F7",
  "бежевый": "#E7D9C4",
  "коричневый": "#92400E",
  "бирюзовый": "#14B8A6",
  "бордовый": "#7F1D1D",
  "салатовый": "#84CC16",
  "мятный": "#6EE7B7",
  "прозрачный": "transparent",
  "золотой": "#D4AF37",
  "серебристый": "#C0C0C0",
};

export function resolveSwatchColor(name: string): string | null {
  return RU_COLOR_SWATCHES[name.trim().toLowerCase()] ?? null;
}

export function isColorFacet(key: string): boolean {
  return key.trim().toLowerCase() === "цвет";
}

// "прозрачный" (transparent) needs a diagonal-stripe fill to read as a swatch
// at all -- a plain transparent circle is indistinguishable from an empty one.
export function swatchStyle(value: string): CSSProperties | undefined {
  const swatch = resolveSwatchColor(value);
  if (swatch === "transparent") {
    return {
      background:
        "linear-gradient(135deg, transparent 46%, #d1d5db 46%, #d1d5db 54%, transparent 54%)",
    };
  }
  return swatch ? { backgroundColor: swatch } : undefined;
}
