// Variant option keys come straight from whoever imported the catalog (see
// backend/app/imports/service.py) -- in practice a mix of English ("color",
// "volume") and Russian ("цвет", "объём") depending on the source file, not a
// fixed enum. This only translates display labels; the underlying key used
// for filtering/selection state stays whatever the data actually has.
const OPTION_LABELS: Record<string, string> = {
  color: "Цвет",
  цвет: "Цвет",
  volume: "Объём",
  объём: "Объём",
  объем: "Объём",
  size: "Размер",
  размер: "Размер",
  material: "Материал",
  материал: "Материал",
};

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

export function optionLabel(key: string): string {
  return OPTION_LABELS[key.trim().toLowerCase()] ?? capitalize(key);
}
