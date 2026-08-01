import type { MetadataRoute } from "next";

import { getCategoryTree, type CategoryNode } from "@/entities/category/api";
import { listProducts } from "@/entities/product/api";
import { getSiteUrl } from "@/shared/lib/siteUrl";

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

// sitemap.ts is prerendered at build time by default (no dynamic APIs used
// below), so `next build` fetches this with no live backend guaranteed --
// same class of issue as the homepage (see (shop)/page.tsx): a standalone
// `docker build` in CI has no "api" host to resolve. Fall back to just the
// static pages so the build succeeds; a live deployment re-generates the full
// sitemap on each request since this route isn't cached beyond that.
async function safeCategoryTree(): Promise<CategoryNode[]> {
  try {
    return await getCategoryTree();
  } catch {
    return [];
  }
}

async function safeProductSlugs(): Promise<string[]> {
  try {
    return await listAllProductSlugs();
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();

  const [categoryTree, productSlugs] = await Promise.all([
    safeCategoryTree(),
    safeProductSlugs(),
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
