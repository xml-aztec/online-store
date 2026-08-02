"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cancelMyOrder, getMyOrder, ORDER_STATUS_LABELS } from "@/entities/orders/api";
import { ApiError } from "@/shared/api/client";
import { formatPrice } from "@/shared/lib/formatPrice";
import { orderStatusPillClass } from "@/shared/lib/orderStatusStyles";

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
      <h1 className="mb-2 font-display text-xl font-bold text-ink">
        Заказ <span className="font-mono">{order.number}</span>
      </h1>
      <p className="mb-6 text-sm text-ink-muted">
        {new Date(order.created_at).toLocaleString("ru-RU")}
      </p>

      <section className="mb-6 rounded-lg border border-ink/10 p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Состав</h2>
        <ul className="space-y-2 text-sm">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between">
              <span>
                {item.product_name}
                {Object.keys(item.variant_options).length > 0 && (
                  <span className="text-ink-muted">
                    {" "}
                    ({Object.values(item.variant_options).join(", ")})
                  </span>
                )}{" "}
                × {item.quantity}
              </span>
              <span className="font-mono">{formatPrice(item.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-1 border-t border-ink/10 pt-3 text-sm">
          <div className="flex justify-between text-ink-muted">
            <span>Товары</span>
            <span className="font-mono">{formatPrice(order.subtotal)}</span>
          </div>
          {Number(order.discount_amount) > 0 && (
            <div className="flex justify-between text-ink-muted">
              <span>Скидка</span>
              <span className="font-mono text-success-700">-{formatPrice(order.discount_amount)}</span>
            </div>
          )}
          <div className="flex justify-between text-ink-muted">
            <span>Доставка</span>
            <span className="font-mono">{formatPrice(order.delivery_cost)}</span>
          </div>
          <div className="flex justify-between font-semibold text-ink">
            <span>Итого</span>
            <span className="font-mono">{formatPrice(order.total)}</span>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-ink/10 p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          История статуса
        </h2>
        <ol className="space-y-3 text-sm">
          {order.status_history.map((entry, index) => (
            <li key={index} className="flex items-center gap-3">
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${orderStatusPillClass(entry.to_status)}`}
              >
                {ORDER_STATUS_LABELS[entry.to_status] ?? entry.to_status}
              </span>
              <span className="text-ink-muted">
                {new Date(entry.created_at).toLocaleString("ru-RU")}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {CANCELLABLE_STATUSES.has(order.status) && (
        <button
          type="button"
          onClick={() => cancelMutation.mutate()}
          disabled={cancelMutation.isPending}
          className="rounded-lg border border-accent-sale/40 px-4 py-2 text-sm text-accent-sale-700 hover:border-accent-sale/60 disabled:opacity-50"
        >
          {cancelMutation.isPending ? "Отменяем…" : "Отменить заказ"}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-accent-sale-700">{error}</p>}
    </div>
  );
}
