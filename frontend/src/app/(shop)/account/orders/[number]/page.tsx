"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cancelMyOrder, getMyOrder, ORDER_STATUS_LABELS } from "@/entities/orders/api";
import { ApiError } from "@/shared/api/client";
import { formatPrice } from "@/shared/lib/formatPrice";
import { orderStatusDotClass, orderStatusLabelClass } from "@/shared/lib/orderStatusStyles";
import { StatusPill } from "@/shared/ui/StatusPill";
import { Timeline } from "@/shared/ui/Timeline";

const CANCELLABLE_STATUSES = new Set(["pending", "awaiting_payment"]);

export default function AccountOrderDetailPage() {
  const params = useParams<{ number: string }>();
  const number = params.number;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["my-order", number],
    queryFn: () => getMyOrder(number),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelMyOrder(number),
    onSuccess: (updated) => {
      setError(null);
      queryClient.setQueryData(["my-order", number], updated);
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Не удалось отменить заказ");
    },
  });

  if (isLoading || !order) {
    return <p className="text-ink-muted">Загрузка…</p>;
  }

  return (
    <div>
      <h2 className="mb-4 font-display text-lg font-extrabold text-ink">Мои заказы</h2>

      <div className="flex flex-col gap-5 rounded-xl bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-[17px] font-bold text-ink">
              № {order.number}
            </span>
            <span className="text-[13px] text-ink-muted">
              {new Date(order.created_at).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <StatusPill status={order.status} size="md" />
          </div>
          {CANCELLABLE_STATUSES.has(order.status) && (
            <button
              type="button"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="rounded-lg border border-accent-sale/30 bg-bg px-4 py-2 font-display text-[13px] font-bold text-accent-sale hover:bg-accent-sale/10 disabled:opacity-50"
            >
              {cancelMutation.isPending ? "Отменяем…" : "Отменить заказ"}
            </button>
          )}
        </div>
        {error && <p className="text-sm text-accent-sale-700">{error}</p>}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-2.5">
            {order.items.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 rounded-lg bg-bg px-4 py-3 text-[13px]"
              >
                <span className="min-w-0 truncate">
                  {item.product_name}
                  {Object.keys(item.variant_options).length > 0 && (
                    <span className="text-ink-muted">
                      {" "}
                      · {Object.values(item.variant_options).join(", ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 whitespace-nowrap font-mono font-semibold text-ink">
                  {item.quantity} × {formatPrice(item.unit_price)}
                </span>
              </div>
            ))}

            <div className="flex flex-col gap-1.5 px-4 pt-1 text-[13px] text-ink-muted">
              <div className="flex justify-between">
                <span>Товары</span>
                <span className="font-mono">{formatPrice(order.subtotal)}</span>
              </div>
              {Number(order.discount_amount) > 0 && (
                <div className="flex justify-between">
                  <span>Скидка</span>
                  <span className="font-mono text-success-700">
                    −{formatPrice(order.discount_amount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Доставка</span>
                <span className="font-mono">{formatPrice(order.delivery_cost)}</span>
              </div>
              <div className="mt-1 flex justify-between font-display text-sm font-bold text-ink">
                <span>Итого с доставкой</span>
                <span className="font-mono text-base">{formatPrice(order.total)}</span>
              </div>
            </div>
          </div>

          <Timeline
            items={order.status_history.map((entry) => ({
              label: ORDER_STATUS_LABELS[entry.to_status] ?? entry.to_status,
              timestamp: new Date(entry.created_at).toLocaleString("ru-RU"),
              dotClass: orderStatusDotClass(entry.to_status),
              labelClass: orderStatusLabelClass(entry.to_status),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
