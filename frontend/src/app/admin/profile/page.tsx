"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useState } from "react";

import { getMe } from "@/entities/auth/api";
import { useAuthStore } from "@/entities/auth/store";
import { createTelegramLink } from "@/entities/telegram/api";

export default function AdminProfilePage() {
  const { email, role } = useAuthStore();
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    // While a fresh link is up and not yet confirmed, poll every 3s so the
    // "подключено" badge flips the moment the manager presses Start in
    // Telegram -- no manual page refresh needed to see it land.
    refetchInterval: (query) =>
      linkUrl && !query.state.data?.telegram_linked ? 3000 : false,
  });

  const linkMutation = useMutation({
    mutationFn: createTelegramLink,
    onSuccess: async (data) => {
      setLinkUrl(data.link_url);
      setCopied(false);
      setQrDataUrl(await QRCode.toDataURL(data.link_url, { margin: 1, width: 220 }));
    },
  });

  // Once linked, the whole panel below renders nothing (gated on !isLinked),
  // so there's no need to also clear linkUrl/qrDataUrl -- a later unlink+relink
  // would just overwrite them via linkMutation's onSuccess again.
  const isLinked = meQuery.data?.telegram_linked ?? false;

  async function handleCopy() {
    if (!linkUrl) return;
    await navigator.clipboard.writeText(linkUrl);
    setCopied(true);
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 font-display text-[22px] font-extrabold text-ink">Профиль</h1>

      <section className="rounded-xl border border-ink/10 bg-bg p-5">
        <p className="text-sm text-ink-muted">Аккаунт</p>
        <p className="font-medium text-ink">{email}</p>
        <p className="mt-1 text-xs text-ink-muted">{role === "admin" ? "Администратор" : "Менеджер"}</p>
      </section>

      <section className="mt-4 rounded-xl border border-ink/10 bg-bg p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-[15px] font-bold text-ink">Telegram-уведомления</p>
            <p className="mt-1 text-sm text-ink-muted">
              Новые заказы, смена статуса и низкий остаток — в чат, со сменой статуса кнопками.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
              isLinked ? "bg-success/10 text-success-700" : "bg-surface text-ink-muted"
            }`}
          >
            {isLinked ? "Подключено" : "Не подключено"}
          </span>
        </div>

        {!isLinked && (
          <div className="mt-4">
            {!linkUrl ? (
              <button
                type="button"
                onClick={() => linkMutation.mutate()}
                disabled={linkMutation.isPending}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {linkMutation.isPending ? "Готовим ссылку…" : "Подключить Telegram"}
              </button>
            ) : (
              <div className="flex flex-col items-start gap-4 sm:flex-row">
                {qrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- a locally generated data: URI (see qrcode.toDataURL above), not a remote image next/image's optimizer could do anything useful with.
                  <img
                    src={qrDataUrl}
                    alt="QR-код для привязки Telegram"
                    width={160}
                    height={160}
                    className="shrink-0 rounded-lg border border-ink/10"
                  />
                )}
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-ink-muted">
                    Отсканируйте QR или откройте ссылку в Telegram. Ссылка одноразовая, действует
                    10 минут.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90"
                    >
                      Открыть в Telegram
                    </a>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-medium text-ink hover:border-brand/40"
                    >
                      {copied ? "Скопировано" : "Копировать ссылку"}
                    </button>
                  </div>
                  <p className="text-xs text-ink-muted">Ожидаем подтверждения…</p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
