"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import { ORDER_STATUS_LABELS } from "@/entities/orders/api";
import { getAdminOrder, refundAdminOrder, updateAdminOrderStatus } from "@/entities/orders/adminApi";
import { ApiError } from "@/shared/api/client";
import { formatPrice } from "@/shared/lib/formatPrice";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AdminOrderDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const [comment, setComment] = useState("");
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

  if (isLoading) return <p className="text-zinc-500">Загрузка…</p>;
  if (!order) return <p className="text-zinc-500">Заказ не найден</p>;

  const transitionTargets = order.allowed_transitions.filter((target) => target !== "refunded");
  const canRefund = role === "admin" && order.allowed_transitions.includes("refunded");
  const isBusy = transitionMutation.isPending || refundMutation.isPending;

  return (
    <div>
      <Link href="/admin/orders" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← К списку заказов
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Заказ {order.number}
        </h1>
        <span className="rounded-full border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700">
          {ORDER_STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase text-zinc-500">Состав заказа</h2>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    <th className="px-3 py-2">Товар</th>
                    <th className="px-3 py-2">Кол-во</th>
                    <th className="px-3 py-2">Цена</th>
                    <th className="px-3 py-2">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, index) => (
                    <tr key={index} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                      <td className="px-3 py-2">
                        {item.product_name}
                        {Object.keys(item.variant_options).length > 0 && (
                          <span className="block text-xs text-zinc-500">
                            {Object.values(item.variant_options).map(String).join(", ")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">{formatPrice(item.unit_price)}</td>
                      <td className="px-3 py-2">{formatPrice(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase text-zinc-500">
              История статусов
            </h2>
            <ol className="space-y-3 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
              {order.status_history.map((entry, index) => (
                <li key={index} className="text-sm">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {entry.from_status ? `${ORDER_STATUS_LABELS[entry.from_status] ?? entry.from_status} → ` : ""}
                    {ORDER_STATUS_LABELS[entry.to_status] ?? entry.to_status}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {new Date(entry.created_at).toLocaleString("ru-RU")}
                    {entry.comment ? ` — ${entry.comment}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-500">Клиент</h2>
            <p className="text-zinc-900 dark:text-zinc-100">{order.full_name}</p>
            <p className="text-zinc-500">{order.email}</p>
            <p className="text-zinc-500">{order.phone}</p>
            <p className="mt-3 text-zinc-500">
              Доставка: {order.delivery_method === "courier" ? "курьером" : "самовывоз"}
            </p>
            {order.delivery_address && (
              <p className="text-zinc-500">{JSON.stringify(order.delivery_address)}</p>
            )}
            {order.comment && <p className="mt-3 text-zinc-500">Комментарий: {order.comment}</p>}
          </section>

          <section className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-500">Итоги</h2>
            <div className="flex justify-between">
              <span className="text-zinc-500">Товары</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            {Number(order.discount_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Скидка</span>
                <span>−{formatPrice(order.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-zinc-500">Доставка</span>
              <span>{formatPrice(order.delivery_cost)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-zinc-200 pt-2 font-semibold dark:border-zinc-800">
              <span>Итого</span>
              <span>{formatPrice(order.total)}</span>
            </div>
          </section>

          {(transitionTargets.length > 0 || canRefund) && (
            <section className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
              <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-500">Действия</h2>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Комментарий (необязательно)"
                rows={2}
                className="mb-3 w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="flex flex-wrap gap-2">
                {transitionTargets.map((target) => (
                  <button
                    key={target}
                    type="button"
                    disabled={isBusy}
                    onClick={() => transitionMutation.mutate(target)}
                    className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700"
                  >
                    → {ORDER_STATUS_LABELS[target] ?? target}
                  </button>
                ))}
                {canRefund && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => refundMutation.mutate()}
                    className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:border-red-400 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
                  >
                    Оформить возврат
                  </button>
                )}
              </div>
              {actionError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{actionError}</p>}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
