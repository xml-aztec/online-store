"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import {
  createAdminPromoCode,
  deleteAdminPromoCode,
  listAdminPromoCodes,
  updateAdminPromoCode,
  type AdminPromoCode,
  type AdminPromoCodeCreate,
} from "@/entities/promoCode/adminApi";
import { useToastStore } from "@/entities/toast/store";
import { ApiError } from "@/shared/api/client";
import { AdminPagination } from "@/shared/ui/AdminPagination";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { Drawer } from "@/shared/ui/Drawer";
import { Toggle } from "@/shared/ui/Toggle";

const QUERY_KEY = ["admin-promo-codes"];
const PAGE_SIZE = 50;

// Excludes visually-ambiguous characters (0/O, 1/I) since codes are typed by
// customers at checkout.
const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  }
  return code;
}

function formatDiscount(promo: Pick<AdminPromoCode, "discount_type" | "discount_value">): string {
  return promo.discount_type === "percent"
    ? `−${promo.discount_value}%`
    : `−${promo.discount_value} сом`;
}

// UTC getters throughout -- starts_at/ends_at are picked as plain calendar
// dates (no time-of-day meaning to the admin), so display must never drift
// with the browser's local timezone the way local Date getters would.
function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(date.getUTCFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

type PromoStatus = "draft" | "active" | "exhausted";

function promoStatus(promo: AdminPromoCode): PromoStatus {
  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) return "exhausted";
  if (!promo.is_active) return "draft";
  return "active";
}

const STATUS_META: Record<PromoStatus, { label: string; text: string; bg: string }> = {
  draft: { label: "Черновик", text: "text-ink-muted", bg: "bg-surface" },
  active: { label: "Активен", text: "text-success-700", bg: "bg-success/10" },
  exhausted: { label: "Исчерпан", text: "text-ink-muted", bg: "bg-surface" },
};

function PromoCodeRow({ promo, onOpen }: { promo: AdminPromoCode; onOpen: () => void }) {
  const status = promoStatus(promo);
  const meta = STATUS_META[status];
  const ratio = promo.max_uses ? promo.used_count / promo.max_uses : 0;
  const barColor = ratio >= 0.9 ? "bg-accent-sale" : "bg-brand";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full items-center gap-2 border-b border-surface px-4 py-2.5 text-left text-[13px] last:border-0 hover:bg-surface/60"
      style={{ gridTemplateColumns: "150px 130px 1fr 110px 90px" }}
    >
      <span className="font-mono font-bold text-ink">{promo.code}</span>
      <span className="font-mono font-semibold text-accent-sale">{formatDiscount(promo)}</span>
      <span className="flex flex-col gap-1 pr-4">
        <span className="font-mono text-[11px] text-ink-muted">
          {promo.used_count}
          {promo.max_uses !== null ? ` из ${promo.max_uses}` : ""}
        </span>
        {promo.max_uses !== null && (
          <span className="block h-[5px] rounded-full bg-surface">
            <span
              className={`block h-[5px] rounded-full ${barColor}`}
              style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
            />
          </span>
        )}
      </span>
      <span className="font-mono text-xs text-ink-muted">{formatDateShort(promo.ends_at)}</span>
      <span>
        <span
          className={`inline-flex whitespace-nowrap rounded-lg px-2.5 py-1 font-display text-[11px] font-bold ${meta.text} ${meta.bg}`}
        >
          {meta.label}
        </span>
      </span>
    </button>
  );
}

function PromoCodesTableSkeleton() {
  return (
    <div className="max-w-[800px] overflow-hidden rounded-xl border border-border bg-bg" aria-busy="true" aria-label="Загрузка промокодов">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="grid items-center gap-2 border-b border-surface px-4 py-2.5 last:border-0"
          style={{ gridTemplateColumns: "150px 130px 1fr 110px 90px" }}
        >
          <div className="h-3.5 w-20 animate-pulse rounded bg-surface" />
          <div className="h-3.5 w-14 animate-pulse rounded bg-surface" />
          <div className="flex flex-col gap-1.5 pr-4">
            <div className="h-2.5 w-16 animate-pulse rounded bg-surface" />
            <div className="h-[5px] w-full animate-pulse rounded-full bg-surface" />
          </div>
          <div className="h-3 w-14 animate-pulse rounded bg-surface" />
          <div className="h-5 w-16 animate-pulse rounded-lg bg-surface" />
        </div>
      ))}
    </div>
  );
}

interface PromoFormValues {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  minOrderTotal: string;
  maxUses: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

function toFormValues(promo: AdminPromoCode | null): PromoFormValues {
  if (!promo) {
    return {
      code: "",
      discountType: "percent",
      discountValue: "10",
      minOrderTotal: "",
      maxUses: "",
      startsAt: "",
      endsAt: "",
      isActive: true,
    };
  }
  return {
    code: promo.code,
    discountType: promo.discount_type === "fixed" ? "fixed" : "percent",
    discountValue: promo.discount_value,
    minOrderTotal: promo.min_order_total ?? "",
    maxUses: promo.max_uses !== null ? String(promo.max_uses) : "",
    startsAt: toDateInputValue(promo.starts_at),
    endsAt: toDateInputValue(promo.ends_at),
    isActive: promo.is_active,
  };
}

function PromoCodeDrawer({
  open,
  onClose,
  promo,
}: {
  open: boolean;
  onClose: () => void;
  promo: AdminPromoCode | null;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [form, setForm] = useState<PromoFormValues>(() => toFormValues(promo));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEdit = promo !== null;

  function update<K extends keyof PromoFormValues>(key: K, value: PromoFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const payload: AdminPromoCodeCreate = {
    code: form.code.trim().toUpperCase(),
    discount_type: form.discountType,
    discount_value: form.discountValue,
    min_order_total: form.minOrderTotal || null,
    max_uses: form.maxUses ? Number(form.maxUses) : null,
    // Explicit Z -- an unambiguous UTC instant, so the calendar date the
    // admin picked can't drift depending on the DB session's timezone.
    starts_at: form.startsAt ? `${form.startsAt}T00:00:00Z` : null,
    ends_at: form.endsAt ? `${form.endsAt}T23:59:59Z` : null,
    is_active: form.isActive,
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      isEdit && promo ? updateAdminPromoCode(promo.id, payload) : createAdminPromoCode(payload),
    onSuccess: () => {
      pushToast(isEdit ? `Промокод «${payload.code}» сохранён` : `Промокод «${payload.code}» создан`);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
    onError: (err: unknown) =>
      pushToast(err instanceof ApiError ? err.message : "Не удалось сохранить промокод", "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminPromoCode(promo!.id),
    onSuccess: () => {
      setConfirmDelete(false);
      pushToast(`Промокод «${promo?.code}» удалён`);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
    onError: (err: unknown) => {
      setConfirmDelete(false);
      pushToast(err instanceof ApiError ? err.message : "Не удалось удалить", "error");
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    saveMutation.mutate();
  }

  const previewCode = form.code.trim().toUpperCase() || "КОД";
  const previewDiscount =
    form.discountType === "percent" ? `−${form.discountValue || 0}%` : `−${form.discountValue || 0} сом`;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={440}
      title={
        <span className="font-display text-base font-extrabold text-ink">
          {isEdit ? "Промокод" : "Новый промокод"}
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 p-5">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          Код
          <span className="flex gap-2">
            <input
              value={form.code}
              onChange={(event) => update("code", event.target.value.toUpperCase())}
              required
              placeholder="SUMMER2026"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 font-mono text-sm font-bold uppercase text-ink outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={() => update("code", generateCode())}
              className="shrink-0 rounded-lg bg-surface px-3 font-display text-xs font-semibold text-ink hover:bg-border/60"
            >
              Сгенерировать
            </button>
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-muted">Тип скидки</span>
          <span className="flex gap-0.5 rounded-lg bg-surface p-0.5">
            {(
              [
                { key: "percent", label: "Процент" },
                { key: "fixed", label: "Фикс. сумма" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => update("discountType", tab.key)}
                className={`flex-1 rounded-md py-1.5 text-center font-display text-xs ${
                  form.discountType === tab.key
                    ? "bg-bg font-bold text-ink shadow-sm"
                    : "font-semibold text-ink-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <span
              title="Нужна миграция БД — CHECK-constraint пока допускает только percent/fixed"
              className="flex-1 cursor-not-allowed rounded-md py-1.5 text-center font-display text-xs font-semibold text-ink-muted/40"
            >
              Доставка 0
            </span>
          </span>
        </div>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          Размер скидки {form.discountType === "percent" ? "(%)" : "(сом)"}
          <input
            value={form.discountValue}
            onChange={(event) => update("discountValue", event.target.value)}
            required
            className="h-10 rounded-lg border border-border bg-bg px-3 font-mono text-sm font-semibold text-ink outline-none focus:border-brand"
          />
        </label>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            Действует с
            <input
              type="date"
              value={form.startsAt}
              onChange={(event) => update("startsAt", event.target.value)}
              className="h-10 rounded-lg border border-border bg-bg px-3 font-mono text-[13px] text-ink outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
            По
            <input
              type="date"
              value={form.endsAt}
              onChange={(event) => update("endsAt", event.target.value)}
              className="h-10 rounded-lg border border-border bg-bg px-3 font-mono text-[13px] text-ink outline-none focus:border-brand"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          Мин. сумма заказа, сом
          <input
            value={form.minOrderTotal}
            onChange={(event) => update("minOrderTotal", event.target.value)}
            placeholder="—"
            className="h-10 rounded-lg border border-border bg-bg px-3 font-mono text-sm font-semibold text-ink outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          Лимит использований
          <input
            value={form.maxUses}
            onChange={(event) => update("maxUses", event.target.value)}
            placeholder="∞"
            className="h-10 rounded-lg border border-border bg-bg px-3 font-mono text-sm font-semibold text-ink outline-none focus:border-brand"
          />
        </label>

        <label className="flex items-center justify-between rounded-lg bg-surface px-3 py-2.5">
          <span className="text-xs font-medium text-ink-muted">Активен</span>
          <Toggle
            checked={form.isActive}
            onChange={(checked) => update("isActive", checked)}
            label="Промокод активен"
          />
        </label>

        <div className="rounded-lg bg-surface px-3.5 py-3 text-xs leading-[1.55] text-ink-muted">
          Клиент увидит:{" "}
          <span className="font-mono font-bold text-ink">{previewCode}</span> — скидка{" "}
          <span className="font-mono font-semibold text-accent-sale">{previewDiscount}</span>
          {form.minOrderTotal && (
            <>
              {" "}при заказе от{" "}
              <span className="font-mono font-semibold text-ink">{form.minOrderTotal} сом</span>
            </>
          )}
          {/* Date-only ISO form ("YYYY-MM-DD") parses as UTC midnight per spec,
              matching formatDateShort's UTC getters -- appending a time here
              without a Z would parse as local time instead and could drift. */}
          {form.endsAt && <>, до {formatDateShort(form.endsAt)}</>}.
        </div>

        {saveMutation.isError && (
          <p className="text-sm text-accent-sale-700">
            {saveMutation.error instanceof ApiError
              ? saveMutation.error.message
              : "Не удалось сохранить промокод"}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="flex-1 rounded-lg bg-brand px-4 py-2.5 font-display text-[13px] font-bold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Сохранение…" : isEdit ? "Сохранить" : "Создать промокод"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface px-4 py-2.5 font-display text-[13px] font-semibold text-ink hover:bg-border/60"
          >
            Отмена
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg px-3 py-2.5 font-display text-[13px] font-semibold text-accent-sale-700 hover:bg-accent-sale/10"
            >
              Удалить
            </button>
          )}
        </div>
      </form>

      {isEdit && promo && (
        <ConfirmDialog
          open={confirmDelete}
          title="Удалить промокод?"
          description={
            <>
              Промокод «{promo.code}» больше нельзя будет применить при оформлении заказа. Уже
              оформленные заказы с этим промокодом не изменятся.
            </>
          }
          confirmLabel={deleteMutation.isPending ? "Удаление…" : "Удалить"}
          pending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </Drawer>
  );
}

export default function AdminPromoCodesPage() {
  const role = useAuthStore((state) => state.role);
  const [openPromoId, setOpenPromoId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: [...QUERY_KEY, page],
    queryFn: () => listAdminPromoCodes(page, PAGE_SIZE),
    enabled: role === "admin",
  });

  if (role !== "admin") {
    return (
      <div>
        <h1 className="mb-6 font-display text-[22px] font-extrabold text-ink">Промокоды</h1>
        <p className="text-ink-muted">Управление промокодами доступно только роли «admin» (ТЗ 6.4).</p>
      </div>
    );
  }

  const openPromo = data?.items.find((promo) => promo.id === openPromoId) ?? null;
  const drawerOpen = creating || openPromo !== null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[20px] font-extrabold text-ink">Промокоды</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-brand px-4 py-2 font-display text-[13px] font-bold text-white hover:bg-brand/90"
        >
          + Создать промокод
        </button>
      </div>

      {isLoading && <PromoCodesTableSkeleton />}
      {data && (
        <div className="max-w-[800px] animate-content-fade-in overflow-hidden rounded-xl border border-border bg-bg">
          <div
            className="grid gap-2 border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
            style={{ gridTemplateColumns: "150px 130px 1fr 110px 90px" }}
          >
            <span>Код</span>
            <span>Скидка</span>
            <span>Использование</span>
            <span>Действует до</span>
            <span>Статус</span>
          </div>
          {data.items.map((promo) => (
            <PromoCodeRow key={promo.id} promo={promo} onOpen={() => setOpenPromoId(promo.id)} />
          ))}
          {data.items.length === 0 && (
            <p className="p-4 text-center text-ink-muted">Промокодов пока нет</p>
          )}
        </div>
      )}

      {data && (
        <div className="max-w-[800px]">
          <AdminPagination page={page} pageSize={data.page_size} total={data.total} onPageChange={setPage} />
        </div>
      )}

      <PromoCodeDrawer
        key={openPromo?.id ?? "new"}
        open={drawerOpen}
        promo={openPromo}
        onClose={() => {
          setCreating(false);
          setOpenPromoId(null);
        }}
      />
    </div>
  );
}
