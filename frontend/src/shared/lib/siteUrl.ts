// Caddy serves plain :80 for "localhost" (no domain yet, see caddy/Caddyfile);
// once Задача 5.3 gives it a real domain, Caddy's automatic HTTPS applies.
export function getSiteUrl(): string {
  const domain = process.env.DOMAIN ?? "localhost";
  return domain === "localhost" ? `http://${domain}` : `https://${domain}`;
}
