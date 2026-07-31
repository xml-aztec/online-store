"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import {
  applyImport,
  downloadImportTemplate,
  getImportStatus,
  uploadImportXlsx,
  type ImportPreview,
} from "@/entities/import/adminApi";

const POLL_INTERVAL_MS = 1500;
const ACTIVE_STATUSES = new Set(["pending", "processing"]);

interface PreviewRow {
  row_number: number;
  name: string | null;
  sku: string | null;
  price: string | null;
  stock_qty: number | null;
  errors: string[];
}

function PreviewTable({ preview }: { preview: ImportPreview }) {
  const rows = preview.rows as unknown as PreviewRow[];
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <th className="px-3 py-2">Строка</th>
            <th className="px-3 py-2">Название</th>
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Цена</th>
            <th className="px-3 py-2">Остаток</th>
            <th className="px-3 py-2">Ошибки</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.row_number}
              className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
            >
              <td className="px-3 py-2">{row.row_number}</td>
              <td className="px-3 py-2">{row.name ?? "—"}</td>
              <td className="px-3 py-2">{row.sku ?? "—"}</td>
              <td className="px-3 py-2">{row.price ?? "—"}</td>
              <td className="px-3 py-2">{row.stock_qty ?? "—"}</td>
              <td className="px-3 py-2 text-red-600 dark:text-red-400">
                {row.errors.length > 0 ? row.errors.join("; ") : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminImportsPage() {
  const role = useAuthStore((state) => state.role);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: uploadImportXlsx,
    onSuccess: (data) => {
      setImportId(data.import_id);
      setApplied(false);
      queryClient.setQueryData(["import-status", data.import_id], {
        id: data.import_id,
        filename: data.filename,
        status: "pending",
        created_count: 0,
        updated_count: 0,
        error_count: 0,
        errors_report_url: null,
        preview: data.preview,
      });
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => applyImport(importId as string),
    onSuccess: (data) => {
      setApplied(true);
      queryClient.setQueryData(["import-status", importId], data);
    },
  });

  const statusQuery = useQuery({
    queryKey: ["import-status", importId],
    queryFn: () => getImportStatus(importId as string),
    enabled: Boolean(importId) && applied,
    refetchInterval: (query) => {
      const current = query.state.data;
      return current && ACTIVE_STATUSES.has(current.status) ? POLL_INTERVAL_MS : false;
    },
  });

  const job = statusQuery.data;

  if (role !== "admin") {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Импорт из Excel
        </h1>
        <p className="text-zinc-500">Импорт товаров доступен только роли «admin» (ТЗ 6.4).</p>
      </div>
    );
  }

  const handleUpload = () => {
    const file = fileInputRef.current?.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  const handleReset = () => {
    setImportId(null);
    setApplied(false);
    uploadMutation.reset();
    applyMutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Импорт из Excel</h1>
        <button
          type="button"
          onClick={() => void downloadImportTemplate()}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:border-zinc-400 dark:border-zinc-700"
        >
          Скачать шаблон
        </button>
      </div>

      {!job && (
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="block text-sm text-zinc-700 dark:text-zinc-300"
          />
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploadMutation.isPending}
            className="mt-3 rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {uploadMutation.isPending ? "Загрузка…" : "Загрузить и посмотреть предпросмотр"}
          </button>
          {uploadMutation.isError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              Не удалось загрузить файл: {uploadMutation.error.message}
            </p>
          )}
        </div>
      )}

      {job && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <span>
              Всего строк: <strong>{job.preview.total_rows}</strong>
            </span>
            <span>
              Будет создано: <strong>{job.preview.created_estimate}</strong>
            </span>
            <span>
              Будет обновлено: <strong>{job.preview.updated_estimate}</strong>
            </span>
            <span>
              Ошибок в предпросмотре: <strong>{job.preview.error_count}</strong>
            </span>
          </div>

          <PreviewTable preview={job.preview} />

          {!applied && (
            <button
              type="button"
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {applyMutation.isPending ? "Запуск…" : "Применить импорт"}
            </button>
          )}

          {applied && (
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              {ACTIVE_STATUSES.has(job.status) ? (
                <p className="text-zinc-500">Импорт обрабатывается…</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <p>
                    Статус:{" "}
                    <strong>{job.status === "completed" ? "завершён" : job.status}</strong>
                  </p>
                  <p>
                    Создано товаров/вариантов: <strong>{job.created_count}</strong>
                  </p>
                  <p>
                    Обновлено товаров/вариантов: <strong>{job.updated_count}</strong>
                  </p>
                  <p>
                    Ошибок: <strong>{job.error_count}</strong>
                  </p>
                  {job.errors_report_url && (
                    <a
                      href={job.errors_report_url}
                      className="inline-block text-zinc-900 underline dark:text-zinc-100"
                    >
                      Скачать отчёт об ошибках
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="text-sm text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Загрузить другой файл
          </button>
        </div>
      )}
    </div>
  );
}
