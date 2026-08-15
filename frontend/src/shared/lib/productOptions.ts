// Shared "цвет=красный; объём=1л" text format for editing a variant's option
// axes as one input instead of a key/value row per axis -- used by both the
// existing product editor and the new-product form.
export function optionsToString(options: Record<string, unknown>): string {
  return Object.entries(options)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("; ");
}

export function parseOptions(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of input.split(";")) {
    const [key, value] = pair.split("=").map((part) => part.trim());
    if (key && value) result[key] = value;
  }
  return result;
}
