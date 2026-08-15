"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import {
  createAdminPromoMessage,
  deleteAdminPromoMessage,
  listAdminPromoMessages,
  reorderAdminPromoMessages,
  updateAdminPromoMessage,
  type AdminPromoMessage,
} from "@/entities/promoMessage/adminApi";
import { ApiError } from "@/shared/api/client";
import { Toggle } from "@/shared/ui/Toggle";

const QUERY_KEY = ["admin-promo-messages"];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function PromoMessageRow({
  message,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}: {
  message: AdminPromoMessage;
  onDragStart: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(message.message);
  const [error, setError] = useState<string | null>(null);

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateAdminPromoMessage>[1]) =>
      updateAdminPromoMessage(message.id, payload),
    onSuccess: () => {
      setError(null);
      void invalidate();
    },
    onError: (err: unknown) => setError(errorMessage(err, "Не удалось сохранить")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminPromoMessage(message.id),
    onSuccess: () => void invalidate(),
    onError: (err: unknown) => setError(errorMessage(err, "Не удалось удалить")),
  });

  function saveIfChanged() {
    const trimmed = text.trim();
    if (trimmed && trimmed !== message.message) updateMutation.mutate({ message: trimmed });
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex cursor-move items-center gap-3 rounded-lg border p-3 ${
        isDragging ? "border-brand bg-brand/5" : "border-ink/10"
      } ${message.is_active ? "" : "opacity-55"}`}
    >
      <span className="text-ink-muted" aria-hidden="true">
        ⠿
      </span>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={saveIfChanged}
        className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-bg px-2.5 py-1.5 text-sm"
      />
      <Toggle
        checked={message.is_active}
        disabled={updateMutation.isPending}
        onChange={(checked) => updateMutation.mutate({ is_active: checked })}
        label={`Сообщение ${message.is_active ? "активно" : "скрыто"}: ${message.message}`}
      />
      <button
        type="button"
        onClick={() => deleteMutation.mutate()}
        disabled={deleteMutation.isPending}
        className="shrink-0 rounded-lg border border-accent-sale/40 px-2 py-1 text-xs text-accent-sale-700 hover:border-accent-sale/60 disabled:opacity-50"
      >
        Удалить
      </button>
      {error && <p className="w-full text-xs text-accent-sale-700">{error}</p>}
    </div>
  );
}

function AddPromoMessageForm() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (message: string) => createAdminPromoMessage(message),
    onSuccess: () => {
      setError(null);
      setText("");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => setError(errorMessage(err, "Не удалось добавить")),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed) createMutation.mutate(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2">
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Например: Бесплатная доставка от 3000 сом"
        className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-bg px-2.5 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={createMutation.isPending || !text.trim()}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {createMutation.isPending ? "Добавление…" : "Добавить"}
      </button>
      {error && <p className="w-full text-xs text-accent-sale-700">{error}</p>}
    </form>
  );
}

export default function AdminPromoMessagesPage() {
  const role = useAuthStore((state) => state.role);
  const queryClient = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const { data: messages, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listAdminPromoMessages,
    enabled: role === "admin",
  });

  const reorderMutation = useMutation({
    mutationFn: (messageIds: string[]) => reorderAdminPromoMessages(messageIds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  if (role !== "admin") {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-ink">Бегущая строка</h1>
        <p className="text-ink-muted">
          Управление бегущей строкой доступно только роли «admin» (ТЗ 6.4).
        </p>
      </div>
    );
  }

  function handleDrop(dropId: string) {
    if (!dragId || dragId === dropId || !messages) {
      setDragId(null);
      return;
    }
    const fromIndex = messages.findIndex((message) => message.id === dragId);
    const toIndex = messages.findIndex((message) => message.id === dropId);
    setDragId(null);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...messages];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    reorderMutation.mutate(reordered.map((message) => message.id));
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-ink">Бегущая строка</h1>
      <p className="mb-4 text-xs text-ink-muted">
        Сообщения показываются по кругу в промо-полосе над шапкой сайта — можно добавить сколько
        угодно. Перетащите за ⠿, чтобы изменить порядок; выключенное сообщение скрывается с сайта.
        Если список пуст, показываются сообщения по умолчанию (бесплатная доставка, оплата при
        получении).
      </p>

      {isLoading && <p className="text-ink-muted">Загрузка…</p>}

      {messages && (
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <PromoMessageRow
              key={message.id}
              message={message}
              isDragging={dragId === message.id}
              onDragStart={() => setDragId(message.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(message.id)}
            />
          ))}
          {messages.length === 0 && (
            <p className="rounded-lg border border-dashed border-ink/15 p-6 text-center text-ink-muted">
              Сообщений пока нет — показываются значения по умолчанию
            </p>
          )}
          <AddPromoMessageForm />
        </div>
      )}
    </div>
  );
}
