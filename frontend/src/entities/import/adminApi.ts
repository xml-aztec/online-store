import { apiFetch, apiFetchRaw } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type ImportPreview = components["schemas"]["ImportPreview"];
export type ImportUploadResponse = components["schemas"]["ImportUploadResponse"];
export type ImportStatusResponse = components["schemas"]["ImportStatusResponse"];

export async function uploadImportXlsx(file: File): Promise<ImportUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiFetchRaw("/admin/imports/xlsx", { method: "POST", body: formData });
  return (await response.json()) as ImportUploadResponse;
}

export async function applyImport(importId: string): Promise<ImportStatusResponse> {
  return apiFetch<ImportStatusResponse>(`/admin/imports/${importId}/apply`, { method: "POST" });
}

export async function getImportStatus(importId: string): Promise<ImportStatusResponse> {
  return apiFetch<ImportStatusResponse>(`/admin/imports/${importId}`);
}

export async function downloadImportTemplate(): Promise<void> {
  const response = await apiFetchRaw("/admin/imports/template");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "import-template.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
