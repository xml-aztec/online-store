"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface AdminPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function AdminPagination({ page, pageSize, total, onPageChange }: AdminPaginationProps) {
  if (total <= pageSize) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-ink-muted">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} из {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Предыдущая страница"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="font-mono text-xs text-ink-muted">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page * pageSize >= total}
          onClick={() => onPageChange(page + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Следующая страница"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
