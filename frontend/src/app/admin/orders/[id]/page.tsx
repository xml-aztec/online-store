"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import { ORDER_STATUS_LABELS } from "@/entities/orders/api";
import { getAdminOrder, refundAdminOrder, updateAdminOrderStatus } from "@/entities/orders/adminApi";
import { ApiError } from "@/shared/api/client";
import { formatPrice } from "@/shared/lib/formatPrice";
import { orderStatusDotClass, orderStatusLabelClass } from "@/shared/lib/orderStatusStyles";
import { StatusPill } from "@/shared/ui/StatusPill";
import { Timeline } from "@/shared/ui/Timeline";

interface PageProps {
  params: Promise<{ id: string }>;
}

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

export default function AdminOrderDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin-order", id],
    queryFn: () => getAdminOrder(id),
  });

  const transitionMutation = useMutation({
    mutationFn: (toStatus: string) => updateAdminOrderStatus(id, toStatus, comment || undefined),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-order", id], data);
      setActionError(null);
      setComment("");
      setShowComment(false);
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.message : "Не удалось изменить статус");
    },
  });

  const refundMutation = useMutation({
    mutationFn: () => refundAdminOrder(id),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-order", id], data);
      setActionError(null);
    },
    onError: (error: unknown) => {
      setActionError(error instanceof ApiError ? error.message : "Не удалось оформить возврат");
    },
  });

  if (isLoading) return <p className="text-ink-muted">Загрузка…</p>;
  if (!order) return <p className="text-ink-muted">Заказ не найден</p>;

  const cancelTarget = order.allowed_transitions.find((target) => target === "cancelled");
  const primaryTarget = order.allowed_transitions.find(
    (target) => target !== "cancelled" && target !== "refunded"
  );
  const extraTargets = order.allowed_transitions.filter(
    (target) => target !== "cancelled" && target !== primaryTarget && target !== "refunded"
  );
  const canRefund = role === "admin" && order.allowed_transitions.includes("refunded");
  const isBusy = transitionMutation.isPending || refundMutation.isPending;

  const helperText =
    order.allowed_transitions.length > 0
      ? `Из статуса «${ORDER_STATUS_LABELS[order.status] ?? order.status}» доступны только ${order.allowed_transitions
          .map((target) => `«${ORDER_STATUS_LABELS[target] ?? target}»`)
          .join(" и ")} — остальные переходы скрыты.`
      : "Статус финальный — переходы недоступны.";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <Link href="/admin/orders" className="text-[13px] text-ink-muted hover:text-ink">
            ← Заказы
          </Link>
          <h1 className="font-display text-[22px] font-extrabold text-ink">
            Заказ <span className="font-mono">{order.number}</span>
          </h1>
          <StatusPill status={order.status} size="md" />
        </div>
        <div className="flex flex-wrap gap-2.5">
          {primaryTarget && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => transitionMutation.mutate(primaryTarget)}
              className="flex h-[38px] items-center rounded-lg bg-brand px-[18px] font-display text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50"
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
              className="flex h-[38px] items-center rounded-lg border border-ink/15 px-[18px] font-display text-sm font-bold text-ink hover:border-ink/30 disabled:opacity-50"
            >
              → {ORDER_STATUS_LABELS[target] ?? target}
            </button>
          ))}
          {cancelTarget && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => transitionMutation.mutate(cancelTarget)}
              className="flex h-[38px] items-center rounded-lg border border-[#FFD4C9] bg-bg px-[18px] font-display text-sm font-bold text-accent-sale hover:bg-accent-sale/10 disabled:opacity-50"
            >
              Отменить
            </button>
          )}
          {canRefund && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => refundMutation.mutate()}
              className="flex h-[38px] items-center rounded-lg border border-ink/15 px-[18px] font-display text-sm font-bold text-ink hover:border-ink/30 disabled:opacity-50"
            >
              Оформить возврат
            </button>
          )}
        </div>
      </div>

      <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">{helperText}</p>
        {order.allowed_transitions.length > 0 && (
          <button
            type="button"
            onClick={() => setShowComment((prev) => !prev)}
            className="text-xs font-medium text-brand hover:underline"
          >
            {showComment ? "Скрыть комментарий" : "+ добавить комментарий"}
          </button>
        )}
      </div>
      {showComment && (
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Комментарий к изменению статуса (необязательно)"
          rows={2}
          className="w-full max-w-md rounded-lg border border-ink/15 px-3 py-2 text-[13px] outline-none focus:border-brand"
        />
      )}
      {actionError && <p className="text-sm text-accent-sale-700">{actionError}</p>}

      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[1fr_1fr_300px]">
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-bg">
          <div className="border-b border-surface px-[18px] py-3.5">
            <span className="font-display text-[15px] font-bold text-ink">Состав заказа</span>
          </div>
          {order.items.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b border-surface px-[18px] py-2.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface">
                <ImageIcon className="h-4 w-4 text-ink/25" aria-hidden="true" strokeWidth={2} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="truncate text-[13px] font-medium leading-tight text-ink">
                  {item.product_name}
                </span>
                <span className="text-[11px] text-ink-muted">
                  {Object.values(item.variant_options).length > 0
                    ? Object.values(item.variant_options).map(String).join(", ") + " · "
                    : ""}
                  снапшот цены на момент заказа
                </span>
              </span>
              <span className="whitespace-nowrap font-mono text-[13px] font-semibold text-ink">
                {item.quantity} × {formatPrice(item.unit_price)}
              </span>
            </div>
          ))}
          {Number(order.discount_amount) > 0 && (
            <div className="flex items-center justify-between px-[18px] pt-3 text-[13px]">
              <span className="text-ink-muted">Скидка</span>
              <span className="font-mono font-semibold text-success-700">
                −{formatPrice(order.discount_amount)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between px-[18px] py-3.5">
            <span className="font-display text-sm font-bold text-ink">Итого с доставкой</span>
            <span className="font-mono text-base font-bold text-ink">
              {formatPrice(order.total)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-2.5 rounded-xl border border-ink/10 bg-bg px-[18px] py-4">
            <span className="font-display text-[15px] font-bold text-ink">Клиент</span>
            <div className="flex flex-col gap-1.5 text-[13px]">
              <span className="text-ink">{order.full_name}</span>
              <span className="font-mono text-ink-muted">{order.phone}</span>
              <span className="text-ink-muted">{order.email}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 rounded-xl border border-ink/10 bg-bg px-[18px] py-4">
            <span className="font-display text-[15px] font-bold text-ink">
              Доставка и оплата
            </span>
            <div className="flex flex-col gap-1.5 text-[13px]">
              <span className="flex justify-between">
                <span className="text-ink-muted">Способ</span>
                <span className="font-medium text-ink">
                  {DELIVERY_METHOD_LABELS[order.delivery_method] ?? order.delivery_method}
                </span>
              </span>
              <span className="flex justify-between gap-3">
                <span className="shrink-0 text-ink-muted">Адрес</span>
                <span className="text-right font-medium text-ink">
                  {order.delivery_method === "pickup"
                    ? "—"
                    : formatAddress(order.delivery_address)}
                </span>
              </span>
              <span className="flex justify-between">
                <span className="text-ink-muted">Оплата</span>
                <span className="font-medium text-ink">
                  {PAYMENT_METHOD_LABELS[order.payment_method] ?? order.payment_method}
                  {" · "}
                  {isOrderPaid(order) ? "оплачено" : "не оплачено"}
                </span>
              </span>
              <span className="flex justify-between">
                <span className="text-ink-muted">Доставка</span>
                <span className="font-mono font-semibold text-ink">
                  {formatPrice(order.delivery_cost)}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-ink/10 bg-bg px-[18px] py-4">
          <span className="font-display text-[15px] font-bold text-ink">История статусов</span>
          <Timeline
            items={order.status_history.map((entry) => ({
              label: ORDER_STATUS_LABELS[entry.to_status] ?? entry.to_status,
              timestamp: new Date(entry.created_at).toLocaleString("ru-RU"),
              description: entry.changed_by ?? undefined,
              dotClass: orderStatusDotClass(entry.to_status),
              labelClass: orderStatusLabelClass(entry.to_status),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
