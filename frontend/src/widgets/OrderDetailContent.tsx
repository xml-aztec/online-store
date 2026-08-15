"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon } from "lucide-react";
import { useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import { ORDER_STATUS_LABELS } from "@/entities/orders/api";
import { getAdminOrder, refundAdminOrder, updateAdminOrderStatus } from "@/entities/orders/adminApi";
import { useToastStore } from "@/entities/toast/store";
import { ApiError } from "@/shared/api/client";
import { formatPrice } from "@/shared/lib/formatPrice";
import { orderStatusDotClass, orderStatusLabelClass } from "@/shared/lib/orderStatusStyles";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { Timeline } from "@/shared/ui/Timeline";

const DELIVERY_METHOD_LABELS: Record<string, string> = {
  courier: "Курьер",
  pickup: "Самовывоз",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash_on_delivery: "Наличными при получении",
  online: "Онлайн",
};

// Only "online" orders actually pass through the "paid" status (set by the
// payment webhook, ТЗ 5.1/5.4) before "processing" -- for those, reaching
// "processing" or later means the money is confirmed in. "cash_on_delivery"
// orders skip awaiting_payment/paid entirely (ТЗ 5.4: pending -> processing
// straight away), so the system has no signal that cash actually changed
// hands until the courier hands the order over -- "delivered" is the only
// point that can honestly be called paid for that method.
const ONLINE_PAID_STATUSES = new Set(["paid", "processing", "shipped", "delivered"]);

function isOrderPaid(order: { payment_method: string; status: string }): boolean {
  if (order.payment_method === "online") return ONLINE_PAID_STATUSES.has(order.status);
  return order.status === "delivered";
}

function formatAddress(address: Record<string, unknown> | null): string {
  if (!address) return "—";
  const city = typeof address.city === "string" ? address.city : null;
  const street = typeof address.street === "string" ? address.street : null;
  const building = typeof address.building === "string" ? address.building : null;
  const apartment = typeof address.apartment === "string" ? address.apartment : null;
  const parts = [
    city,
    street,
    building ? `д. ${building}` : null,
    apartment ? `кв. ${apartment}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : JSON.stringify(address);
}

interface OrderDetailContentProps {
  orderId: string;
}

/** The order detail body -- shared between the standalone /admin/orders/[id]
 * page and the drawer opened from the orders list (?order=<id>), so there's
 * exactly one implementation of "show this order + its actions". Both mount
 * points query the same ["admin-order", orderId] key, so TanStack Query
 * dedupes the fetch when a drawer's header also reads it for the status pill. */
export function OrderDetailContent({ orderId }: OrderDetailContentProps) {
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const pushToast = useToastStore((state) => state.push);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin-order", orderId],
    queryFn: () => getAdminOrder(orderId),
  });

  const transitionMutation = useMutation({
    mutationFn: (toStatus: string) =>
      updateAdminOrderStatus(orderId, toStatus, comment || undefined),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-order", orderId], data);
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      setActionError(null);
      setComment("");
      setShowComment(false);
      pushToast(`Заказ ${data.number} переведён «${ORDER_STATUS_LABELS[data.status] ?? data.status}»`);
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.message : "Не удалось изменить статус");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => updateAdminOrderStatus(orderId, "cancelled", cancelReason || undefined),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-order", orderId], data);
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      setActionError(null);
      setCancelDialogOpen(false);
      setCancelReason("");
      pushToast(`Заказ ${data.number} отменён`);
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.message : "Не удалось отменить заказ");
    },
  });

  const refundMutation = useMutation({
    mutationFn: () => refundAdminOrder(orderId),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-order", orderId], data);
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      setActionError(null);
      pushToast(`Возврат по заказу ${data.number} оформлен`);
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.message : "Не удалось оформить возврат");
    },
  });

  if (isLoading) return <p className="p-[18px] text-ink-muted">Загрузка…</p>;
  if (!order) return <p className="p-[18px] text-ink-muted">Заказ не найден</p>;

  const cancelTarget = order.allowed_transitions.find((target) => target === "cancelled");
  const primaryTarget = order.allowed_transitions.find(
    (target) => target !== "cancelled" && target !== "refunded"
  );
  const extraTargets = order.allowed_transitions.filter(
    (target) => target !== "cancelled" && target !== primaryTarget && target !== "refunded"
  );
  const canRefund = role === "admin" && order.allowed_transitions.includes("refunded");
  const isBusy = transitionMutation.isPending || refundMutation.isPending || cancelMutation.isPending;
  const wasPaidOnline = order.payment_method === "online" && isOrderPaid(order);

  const helperText =
    order.allowed_transitions.length > 0
      ? `Из статуса «${ORDER_STATUS_LABELS[order.status] ?? order.status}» доступны только ${order.allowed_transitions
          .map((target) => `«${ORDER_STATUS_LABELS[target] ?? target}»`)
          .join(" и ")} — остальные переходы скрыты.`
      : "Статус финальный — переходы недоступны.";

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap gap-2">
        {primaryTarget && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => transitionMutation.mutate(primaryTarget)}
            className="flex h-9 flex-1 items-center justify-center rounded-lg bg-brand px-4 font-display text-[13px] font-bold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            → {ORDER_STATUS_LABELS[primaryTarget] ?? primaryTarget}
          </button>
        )}
        {extraTargets.map((target) => (
          <button
            key={target}
            type="button"
            disabled={isBusy}
            onClick={() => transitionMutation.mutate(target)}
            className="flex h-9 items-center rounded-lg border border-border px-4 font-display text-[13px] font-bold text-ink hover:border-ink/30 disabled:opacity-50"
          >
            → {ORDER_STATUS_LABELS[target] ?? target}
          </button>
        ))}
        {cancelTarget && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setCancelDialogOpen(true)}
            className="flex h-9 items-center rounded-lg border border-[#FFD4C9] bg-bg px-4 font-display text-[13px] font-bold text-accent-sale hover:bg-accent-sale/10 disabled:opacity-50"
          >
            Отменить…
          </button>
        )}
      </div>
      <p className="-mt-2 text-[11px] text-ink-muted">{helperText}</p>

      {order.allowed_transitions.length > 0 && (
        <div className="-mt-2">
          <button
            type="button"
            onClick={() => setShowComment((prev) => !prev)}
            className="text-xs font-medium text-brand-text hover:underline"
          >
            {showComment ? "Скрыть комментарий" : "+ добавить комментарий"}
          </button>
          {showComment && (
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Комментарий к изменению статуса (необязательно)"
              rows={2}
              className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
            />
          )}
        </div>
      )}
      {canRefund && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => refundMutation.mutate()}
          className="-mt-1 self-start rounded-lg border border-border px-4 py-2 font-display text-[13px] font-bold text-ink hover:border-ink/30 disabled:opacity-50"
        >
          Оформить возврат
        </button>
      )}
      {actionError && <p className="text-sm text-accent-sale-700">{actionError}</p>}

      <div className="flex flex-col gap-2">
        <span className="font-display text-[13px] font-bold text-ink">Состав</span>
        {order.items.map((item, index) => (
          <div
            key={index}
            className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2.5"
          >
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-bg">
              <ImageIcon className="h-3.5 w-3.5 text-ink-muted/50" aria-hidden="true" strokeWidth={2} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate text-xs font-medium leading-tight text-ink">
                {item.product_name}
              </span>
              <span className="text-[11px] text-ink-muted">
                {Object.values(item.variant_options).length > 0
                  ? Object.values(item.variant_options).map(String).join(", ")
                  : "снапшот цены на момент заказа"}
              </span>
            </span>
            <span className="whitespace-nowrap font-mono text-xs font-semibold text-ink">
              {item.quantity} × {formatPrice(item.unit_price)}
            </span>
          </div>
        ))}
        {Number(order.discount_amount) > 0 && (
          <div className="flex items-center justify-between px-1 text-[13px]">
            <span className="text-ink-muted">Скидка</span>
            <span className="font-mono font-semibold text-success-700">
              −{formatPrice(order.discount_amount)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="font-display text-sm font-bold text-ink">Итого с доставкой</span>
          <span className="font-mono text-base font-bold text-ink">{formatPrice(order.total)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Клиент
          </span>
          <span className="text-[13px] font-medium text-ink">{order.full_name}</span>
          <span className="font-mono text-xs text-ink-muted">{order.phone}</span>
          <span className="truncate text-xs text-ink-muted">{order.email}</span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Доставка
          </span>
          <span className="text-[13px] font-medium text-ink">
            {DELIVERY_METHOD_LABELS[order.delivery_method] ?? order.delivery_method}
          </span>
          <span className="text-xs text-ink-muted">
            {order.delivery_method === "pickup" ? "—" : formatAddress(order.delivery_address)}
          </span>
          <span className={`text-xs font-semibold ${isOrderPaid(order) ? "text-success-700" : "text-ink-muted"}`}>
            {PAYMENT_METHOD_LABELS[order.payment_method] ?? order.payment_method}
            {" · "}
            {isOrderPaid(order) ? "оплачено" : "не оплачено"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-display text-[13px] font-bold text-ink">История</span>
        <Timeline
          items={order.status_history.map((entry) => ({
            label: ORDER_STATUS_LABELS[entry.to_status] ?? entry.to_status,
            timestamp: new Date(entry.created_at).toLocaleString("ru-RU"),
            description: entry.comment ?? undefined,
            dotClass: orderStatusDotClass(entry.to_status),
            labelClass: orderStatusLabelClass(entry.to_status),
          }))}
        />
      </div>

      <ConfirmDialog
        open={cancelDialogOpen}
        title={`Отменить заказ № ${order.number}?`}
        description={
          wasPaidOnline ? (
            <>
              Заказ оплачен онлайн — сумма не вернётся клиенту автоматически, возврат нужно будет
              оформить отдельно кнопкой «Оформить возврат» после отмены. Действие необратимо,
              клиент увидит причину в истории заказа.
            </>
          ) : (
            "Действие необратимо, клиент увидит причину в истории заказа."
          )
        }
        confirmLabel="Отменить заказ"
        pending={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate()}
        onClose={() => setCancelDialogOpen(false)}
      >
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
          Причина:
          <input
            type="text"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="Например: товар повреждён на складе"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
