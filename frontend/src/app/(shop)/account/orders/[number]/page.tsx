"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cancelMyOrder, getMyOrder, ORDER_STATUS_LABELS } from "@/entities/orders/api";
import { ApiError } from "@/shared/api/client";
import { formatPrice } from "@/shared/lib/formatPrice";

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
    return <p className="text-zinc-500">Загрузка…</p>;
  }

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        Заказ {order.number}
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        {new Date(order.created_at).toLocaleString("ru-RU")}
      </p>

      <section className="mb-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Состав</h2>
        <ul className="space-y-2 text-sm">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between">
              <span>
                {item.product_name}
                {Object.keys(item.variant_options).length > 0 && (
                  <span className="text-zinc-500">
                    {" "}
                    ({Object.values(item.variant_options).join(", ")})
                  </span>
                )}{" "}
                × {item.quantity}
              </span>
              <span>{formatPrice(item.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-1 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
          <div className="flex justify-between text-zinc-500">
            <span>Товары</span>
            <span>{formatPrice(order.subtotal)}</span>
          </div>
          {Number(order.discount_amount) > 0 && (
            <div className="flex justify-between text-zinc-500">
              <span>Скидка</span>
              <span>-{formatPrice(order.discount_amount)}</span>
            </div>
          )}
          <div className="flex justify-between text-zinc-500">
            <span>Доставка</span>
            <span>{formatPrice(order.delivery_cost)}</span>
          </div>
          <div className="flex justify-between font-semibold text-zinc-900 dark:text-zinc-100">
            <span>Итого</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          История статуса
        </h2>
        <ol className="space-y-3 text-sm">
          {order.status_history.map((entry, index) => (
            <li key={index} className="flex items-center gap-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-900 dark:bg-zinc-100" />
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {ORDER_STATUS_LABELS[entry.to_status] ?? entry.to_status}
              </span>
              <span className="text-zinc-500">
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
          className="rounded border border-red-300 px-4 py-2 text-sm text-red-600 hover:border-red-400 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
        >
          {cancelMutation.isPending ? "Отменяем…" : "Отменить заказ"}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
