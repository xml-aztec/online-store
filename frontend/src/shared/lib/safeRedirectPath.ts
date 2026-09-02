// The only legitimate producers of `?redirect=` (admin/layout.tsx,
// account/layout.tsx, favorites/page.tsx, FavoriteButton.tsx) always pass
// `encodeURIComponent(pathname)` -- an in-app path. But the query param
// itself is attacker-controlled input: a crafted link like
// `/login?redirect=https://evil.example` would otherwise send someone who
// just authenticated on the real site off to a phishing page. Only accept
// values that look like a same-app path (a single leading `/`, not the
// protocol-relative `//host/...`), falling back to `fallback` otherwise.
export function safeRedirectPath(value: string | null, fallback: string): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return fallback;
}
