import Link from "next/link";

import type { CategoryNode } from "@/entities/category/api";

interface CategoryListProps {
  nodes: CategoryNode[];
  activeSlugPath: string[];
  depth: number;
  parentPath: string[];
}

function CategoryList({ nodes, activeSlugPath, depth, parentPath }: CategoryListProps) {
  return (
    <ul
      className={
        depth > 0
          ? "ml-3 mt-1 space-y-1 border-l border-zinc-200 pl-3 dark:border-zinc-800"
          : "space-y-1"
      }
    >
      {nodes.map((node) => {
        const path = [...parentPath, node.slug];
        const isAncestorOrSelf = activeSlugPath[depth] === node.slug;
        const isActive = isAncestorOrSelf && activeSlugPath.length === depth + 1;

        return (
          <li key={node.id}>
            <Link
              href={`/catalog/${path.join("/")}`}
              className={
                isActive
                  ? "font-semibold text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }
            >
              {node.name}
            </Link>
            {isAncestorOrSelf && node.children.length > 0 && (
              <CategoryList
                nodes={node.children}
                activeSlugPath={activeSlugPath}
                depth={depth + 1}
                parentPath={path}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CategorySidebar({
  tree,
  activeSlugPath,
}: {
  tree: CategoryNode[];
  activeSlugPath: string[];
}) {
  return (
    <nav
      aria-label="Категории"
      className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800"
    >
      <Link
        href="/catalog"
        className={
          activeSlugPath.length === 0
            ? "mb-2 block font-semibold text-zinc-900 dark:text-zinc-100"
            : "mb-2 block text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        }
      >
        Все товары
      </Link>
      <CategoryList nodes={tree} activeSlugPath={activeSlugPath} depth={0} parentPath={[]} />
    </nav>
  );
}
