import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/shared/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/cart", "/checkout", "/login"],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
