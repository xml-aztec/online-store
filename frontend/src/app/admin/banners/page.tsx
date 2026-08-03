"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { useAuthStore } from "@/entities/auth/store";
import {
  createAdminBanner,
  deleteAdminBanner,
  listAdminBanners,
  reorderAdminBanners,
  replaceAdminBannerImage,
  updateAdminBanner,
  type AdminBanner,
} from "@/entities/banner/adminApi";
import { ApiError } from "@/shared/api/client";
import { Toggle } from "@/shared/ui/Toggle";

const QUERY_KEY = ["admin-banners"];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function BannerCard({
  banner,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}: {
  banner: AdminBanner;
  onDragStart: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(banner.title ?? "");
  const [subtitle, setSubtitle] = useState(banner.subtitle ?? "");
  const [linkUrl, setLinkUrl] = useState(banner.link_url ?? "");
  const [buttonText, setButtonText] = useState(banner.button_text ?? "");

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateAdminBanner>[1]) =>
      updateAdminBanner(banner.id, payload),
    onSuccess: () => {
      setError(null);
      void invalidate();
    },
    onError: (err: unknown) => setError(errorMessage(err, "Не удалось сохранить")),
  });

  const replaceImageMutation = useMutation({
    mutationFn: (file: File) => replaceAdminBannerImage(banner.id, file),
    onSuccess: () => {
      setError(null);
      void invalidate();
    },
    onError: (err: unknown) => setError(errorMessage(err, "Не удалось загрузить фото")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminBanner(banner.id),
    onSuccess: () => void invalidate(),
    onError: (err: unknown) => setError(errorMessage(err, "Не удалось удалить")),
  });

  function saveIfChanged(field: "title" | "subtitle" | "link_url" | "button_text", value: string) {
    const next = value.trim() || null;
    if (banner[field] !== next) updateMutation.mutate({ [field]: next });
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex cursor-move flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start ${
        isDragging ? "border-brand bg-brand/5" : "border-ink/10"
      } ${banner.is_active ? "" : "opacity-55"}`}
    >
      <div className="flex shrink-0 items-start gap-2">
        <span className="mt-2 text-ink-muted" aria-hidden="true">
          ⠿
        </span>
        <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-lg bg-surface">
          <Image
            src={banner.thumbnail_url}
            alt={banner.title ?? "Баннер"}
            fill
            unoptimized
            sizes="160px"
            className="object-cover"
          />
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => saveIfChanged("title", title)}
          placeholder="Заголовок"
          className="rounded-lg border border-ink/15 bg-bg px-2 py-1.5 text-sm"
        />
        <input
          value={subtitle}
          onChange={(event) => setSubtitle(event.target.value)}
          onBlur={() => saveIfChanged("subtitle", subtitle)}
          placeholder="Подзаголовок"
          className="rounded-lg border border-ink/15 bg-bg px-2 py-1.5 text-sm"
        />
        <input
          value={linkUrl}
          onChange={(event) => setLinkUrl(event.target.value)}
          onBlur={() => saveIfChanged("link_url", linkUrl)}
          placeholder="Ссылка (например /catalog)"
          className="rounded-lg border border-ink/15 bg-bg px-2 py-1.5 font-mono text-sm"
        />
        <input
          value={buttonText}
          onChange={(event) => setButtonText(event.target.value)}
          onBlur={() => saveIfChanged("button_text", buttonText)}
          placeholder="Текст кнопки"
          className="rounded-lg border border-ink/15 bg-bg px-2 py-1.5 text-sm"
        />
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <Toggle
          checked={banner.is_active}
          disabled={updateMutation.isPending}
          onChange={(checked) => updateMutation.mutate({ is_active: checked })}
          label={`Баннер ${banner.is_active ? "активен" : "скрыт"}: ${banner.title ?? banner.id}`}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={replaceImageMutation.isPending}
          className="whitespace-nowrap rounded-lg border border-ink/15 px-2 py-1 text-xs text-ink-muted hover:border-brand/40 hover:text-ink disabled:opacity-50"
        >
          {replaceImageMutation.isPending ? "Загрузка…" : "Заменить фото"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) replaceImageMutation.mutate(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          className="rounded-lg border border-accent-sale/40 px-2 py-1 text-xs text-accent-sale-700 hover:border-accent-sale/60 disabled:opacity-50"
        >
          Удалить
        </button>
      </div>
      {error && <p className="w-full text-xs text-accent-sale-700">{error}</p>}
    </div>
  );
}

function AddBannerButton() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => createAdminBanner(file, {}),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => setError(errorMessage(err, "Не удалось загрузить фото")),
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMutation.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-ink/20 py-6 text-sm font-semibold text-ink-muted hover:border-brand hover:text-brand disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {uploadMutation.isPending ? "Загрузка…" : "Добавить баннер"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) uploadMutation.mutate(file);
          event.target.value = "";
        }}
      />
      {error && <p className="mt-2 text-xs text-accent-sale-700">{error}</p>}
    </div>
  );
}

export default function AdminBannersPage() {
  const role = useAuthStore((state) => state.role);
  const queryClient = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const { data: banners, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listAdminBanners,
    enabled: role === "admin",
  });

  const reorderMutation = useMutation({
    mutationFn: (bannerIds: string[]) => reorderAdminBanners(bannerIds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  if (role !== "admin") {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-ink">Баннеры</h1>
        <p className="text-ink-muted">
          Управление баннерами доступно только роли «admin» (ТЗ 6.4).
        </p>
      </div>
    );
  }

  function handleDrop(dropId: string) {
    if (!dragId || dragId === dropId || !banners) {
      setDragId(null);
      return;
    }
    const fromIndex = banners.findIndex((banner) => banner.id === dragId);
    const toIndex = banners.findIndex((banner) => banner.id === dropId);
    setDragId(null);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...banners];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    reorderMutation.mutate(reordered.map((banner) => banner.id));
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-ink">Баннеры</h1>
      <p className="mb-4 text-xs text-ink-muted">
        Баннеры показываются на главной странице по очереди — можно добавить сколько угодно.
        Перетащите за ⠿, чтобы изменить порядок; выключенный баннер скрывается с сайта.
      </p>

      {isLoading && <p className="text-ink-muted">Загрузка…</p>}

      {banners && (
        <div className="flex flex-col gap-3">
          {banners.map((banner) => (
            <BannerCard
              key={banner.id}
              banner={banner}
              isDragging={dragId === banner.id}
              onDragStart={() => setDragId(banner.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(banner.id)}
            />
          ))}
          {banners.length === 0 && (
            <p className="rounded-lg border border-dashed border-ink/15 p-6 text-center text-ink-muted">
              Баннеров пока нет
            </p>
          )}
          <AddBannerButton />
        </div>
      )}
    </div>
  );
}
