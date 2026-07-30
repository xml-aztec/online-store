import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type CategoryNode = components["schemas"]["CategoryNode"];

export async function getCategoryTree(): Promise<CategoryNode[]> {
  return apiFetch<CategoryNode[]>("/categories", { next: { revalidate: 300 } });
}

export function findCategoryByPath(
  tree: CategoryNode[],
  slugs: string[]
): CategoryNode | null {
  let nodes = tree;
  let found: CategoryNode | null = null;

  for (const slug of slugs) {
    found = nodes.find((node) => node.slug === slug) ?? null;
    if (!found) return null;
    nodes = found.children;
  }

  return found;
}
