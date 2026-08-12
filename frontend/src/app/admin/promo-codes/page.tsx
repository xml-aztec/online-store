"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Dices, Plus, X } from "lucide-react";
import { useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import {
  createAdminPromoCode,
  deleteAdminPromoCode,
  listAdminPromoCodes,
  updateAdminPromoCode,
  type AdminPromoCode,
} from "@/entities/promoCode/adminApi";
import { useToastStore } from "@/entities/toast/store";
import { ApiError } from "@/shared/api/client";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { Drawer } from "@/shared/ui/Drawer";

const QUERY_KEY = ["admin-promo-codes"];

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

function PromoCodeRow({ promo }: { promo: AdminPromoCode }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [discountValue, setDiscountValue] = useState(promo.discount_value);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateAdminPromoCode>[1]) =>
      updateAdminPromoCode(promo.id, payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err: unknown) =>
      pushToast(err instanceof ApiError ? err.message : "Не удалось сохранить", "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminPromoCode(promo.id),
    onSuccess: () => {
      setConfirmDelete(false);
      pushToast(`Промокод «${promo.code}» удалён`);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => {
      setConfirmDelete(false);
      pushToast(err instanceof ApiError ? err.message : "Не удалось удалить", "error");
    },
  });

  const dirty = discountValue !== promo.discount_value;

  return (
    <>
      <tr className="group border-b border-border/60 align-top text-sm last:border-0 hover:bg-surface">
        <td className="px-3 py-2.5 font-mono font-semibold text-ink">{promo.code}</td>
        <td className="px-3 py-2.5">
          <span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-text">
            {promo.discount_type === "percent" ? "%" : "сом"}
          </span>
        </td>
        <td className="px-2 py-2.5">
          <input
            value={discountValue}
            onChange={(event) => setDiscountValue(event.target.value)}
            className="w-20 rounded-lg border border-border bg-bg px-2 py-1 font-mono text-sm text-ink outline-none focus:border-brand"
          />
        </td>
        <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">
          {promo.min_order_total ?? "—"}
        </td>
        <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">{promo.max_uses ?? "∞"}</td>
        <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">{promo.used_count}</td>
        <td className="px-3 py-2.5">
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={promo.is_active}
              onChange={(event) => updateMutation.mutate({ is_active: event.target.checked })}
              className="h-3.5 w-3.5 accent-brand"
            />
            активен
          </label>
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              title="Сохранить"
              onClick={() => updateMutation.mutate({ discount_value: discountValue })}
              disabled={updateMutation.isPending || !dirty}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                dirty ? "text-brand-text hover:bg-brand-soft" : "text-ink-muted/40"
              } disabled:cursor-not-allowed`}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Удалить"
              onClick={() => setConfirmDelete(true)}
              disabled={deleteMutation.isPending}
              aria-label={`Удалить «${promo.code}»`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-accent-sale/10 hover:text-accent-sale-700 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </td>
      </tr>
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
    </>
  );
}

function CreatePromoCodeDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [minOrderTotal, setMinOrderTotal] = useState("");
  const [maxUses, setMaxUses] = useState("");

  const mutation = useMutation({
    mutationFn: createAdminPromoCode,
    onSuccess: () => {
      pushToast(`Промокод «${code.trim().toUpperCase()}» создан`);
      setCode("");
      setDiscountType("percent");
      setDiscountValue("10");
      setMinOrderTotal("");
      setMaxUses("");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
    onError: (err: unknown) =>
      pushToast(err instanceof ApiError ? err.message : "Не удалось создать промокод", "error"),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    mutation.mutate({
      code: code.trim().toUpperCase(),
      discount_type: discountType,
      discount_value: discountValue,
      min_order_total: minOrderTotal || null,
      max_uses: maxUses ? Number(maxUses) : null,
      is_active: true,
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={460}
      title={<span className="font-display text-base font-extrabold text-ink">Новый промокод</span>}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Код</label>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              required
              placeholder="SUMMER2026"
              className="w-full min-w-0 rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm uppercase text-ink outline-none focus:border-brand"
            />
            <button
              type="button"
              title="Сгенерировать код"
              onClick={() => setCode(generateCode())}
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-border text-ink-muted hover:border-brand/40 hover:text-ink"
            >
              <Dices className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div>
          <span className="mb-1 block text-xs text-ink-muted">Тип скидки</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: "percent", label: "Процент" },
                { key: "fixed", label: "Фикс. сумма" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setDiscountType(tab.key)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  discountType === tab.key
                    ? "border-brand bg-brand-soft text-brand-text"
                    : "border-border text-ink-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* ТЗ plan-razrabotki 4.3+ v2 design also shows a third "Доставка 0"
              tab -- discount_type is a DB CHECK constraint limited to
              percent/fixed, so a free-shipping promo type needs a backend
              migration deferred to Part 2. */}
        </div>

        <div>
          <label className="mb-1 block text-xs text-ink-muted">
            Размер скидки {discountType === "percent" ? "(%)" : "(сом)"}
          </label>
          <input
            value={discountValue}
            onChange={(event) => setDiscountValue(event.target.value)}
            required
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-brand"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Мин. сумма заказа</label>
            <input
              value={minOrderTotal}
              onChange={(event) => setMinOrderTotal(event.target.value)}
              placeholder="—"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Лимит использований</label>
            <input
              value={maxUses}
              onChange={(event) => setMaxUses(event.target.value)}
              placeholder="∞"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-brand"
            />
          </div>
        </div>

        {mutation.isError && (
          <p className="text-sm text-accent-sale-700">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : "Не удалось создать промокод"}
          </p>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-brand px-4 py-2.5 font-display text-[13px] font-bold text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {mutation.isPending ? "Создание…" : "Создать промокод"}
        </button>
      </form>
    </Drawer>
  );
}

export default function AdminPromoCodesPage() {
  const role = useAuthStore((state) => state.role);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listAdminPromoCodes(1, 100),
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[22px] font-extrabold text-ink">
          Промокоды{" "}
          <span className="font-mono text-base font-normal text-ink-muted">
            {data?.items.length ?? 0}
          </span>
        </h1>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 font-display text-[13px] font-bold text-white hover:bg-brand/90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Создать промокод
        </button>
      </div>

      {isLoading && <p className="text-ink-muted">Загрузка…</p>}
      {data && (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-3 py-2">Код</th>
                <th className="px-3 py-2">Тип</th>
                <th className="px-3 py-2">Размер</th>
                <th className="px-3 py-2">Мин. сумма</th>
                <th className="px-3 py-2">Лимит</th>
                <th className="px-3 py-2">Использовано</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((promo) => (
                <PromoCodeRow key={promo.id} promo={promo} />
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && (
            <p className="p-4 text-center text-ink-muted">Промокодов пока нет</p>
          )}
        </div>
      )}

      <CreatePromoCodeDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
