import type { MetadataRoute } from "next";

import { getCategoryTree, type CategoryNode } from "@/entities/category/api";
import { listProducts } from "@/entities/product/api";

// Caddy serves plain :80 for "localhost" (no domain yet, see caddy/Caddyfile);
// once Задача 5.3 gives it a real domain, Caddy's automatic HTTPS applies.
function siteUrl(): string {
  const domain = process.env.DOMAIN ?? "localhost";
  return domain === "localhost" ? `http://${domain}` : `https://${domain}`;
}

function flattenCategoryPaths(nodes: CategoryNode[], prefix: string[] = []): string[][] {
  return nodes.flatMap((node) => {
    const path = [...prefix, node.slug];
    return [path, ...flattenCategoryPaths(node.children, path)];
  });
}

async function listAllProductSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  let page = 1;
  const pageSize = 100;

  for (;;) {
    const response = await listProducts({ page, page_size: pageSize });
    slugs.push(...response.items.map((item) => item.slug));
    if (page * pageSize >= response.total) break;
    page += 1;
  }

  return slugs;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const [categoryTree, productSlugs] = await Promise.all([
    getCategoryTree(),
    listAllProductSlugs(),
  ]);
  const categoryPaths = flattenCategoryPaths(categoryTree);

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/catalog`, changeFrequency: "daily", priority: 0.9 },
    ...categoryPaths.map((path) => ({
      url: `${base}/catalog/${path.join("/")}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...productSlugs.map((slug) => ({
      url: `${base}/product/${slug}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
