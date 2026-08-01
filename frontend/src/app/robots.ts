import type { MetadataRoute } from "next";

function siteUrl(): string {
  const domain = process.env.DOMAIN ?? "localhost";
  return domain === "localhost" ? `http://${domain}` : `https://${domain}`;
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/cart", "/checkout", "/login"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
