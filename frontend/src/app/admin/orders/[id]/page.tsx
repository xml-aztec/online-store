"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import { ORDER_STATUS_LABELS } from "@/entities/orders/api";
import { getAdminOrder, refundAdminOrder, updateAdminOrderStatus } from "@/entities/orders/adminApi";
import { ApiError } from "@/shared/api/client";
import { formatPrice } from "@/shared/lib/formatPrice";
import { StatusPill } from "@/shared/ui/StatusPill";
import { Timeline } from "@/shared/ui/Timeline";

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

  if (isLoading) return <p className="text-ink-muted">Загрузка…</p>;
  if (!order) return <p className="text-ink-muted">Заказ не найден</p>;

  const transitionTargets = order.allowed_transitions.filter((target) => target !== "refunded");
  const canRefund = role === "admin" && order.allowed_transitions.includes("refunded");
  const isBusy = transitionMutation.isPending || refundMutation.isPending;

  return (
    <div>
      <Link href="/admin/orders" className="text-sm text-ink-muted hover:text-ink">
        ← К списку заказов
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink">
          Заказ <span className="font-mono">{order.number}</span>
        </h1>
        <StatusPill status={order.status} size="md" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase text-ink-muted">Состав заказа</h2>
            <div className="overflow-x-auto rounded-lg border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-surface text-left text-ink-muted">
                    <th className="px-3 py-2">Товар</th>
                    <th className="px-3 py-2">Кол-во</th>
                    <th className="px-3 py-2">Цена</th>
                    <th className="px-3 py-2">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, index) => (
                    <tr key={index} className="border-b border-ink/10 last:border-0">
                      <td className="px-3 py-2">
                        {item.product_name}
                        {Object.keys(item.variant_options).length > 0 && (
                          <span className="block text-xs text-ink-muted">
                            {Object.values(item.variant_options).map(String).join(", ")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono">{item.quantity}</td>
                      <td className="px-3 py-2 font-mono">{formatPrice(item.unit_price)}</td>
                      <td className="px-3 py-2 font-mono">{formatPrice(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase text-ink-muted">
              История статусов
            </h2>
            <Timeline
              items={order.status_history.map((entry) => ({
                label: ORDER_STATUS_LABELS[entry.to_status] ?? entry.to_status,
                timestamp: new Date(entry.created_at).toLocaleString("ru-RU"),
                description: entry.comment ?? undefined,
              }))}
            />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-lg border border-ink/10 p-4 text-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase text-ink-muted">Клиент</h2>
            <p className="text-ink">{order.full_name}</p>
            <p className="text-ink-muted">{order.email}</p>
            <p className="text-ink-muted">{order.phone}</p>
            <p className="mt-3 text-ink-muted">
              Доставка: {order.delivery_method === "courier" ? "курьером" : "самовывоз"}
            </p>
            {order.delivery_address && (
              <p className="text-ink-muted">{JSON.stringify(order.delivery_address)}</p>
            )}
            {order.comment && <p className="mt-3 text-ink-muted">Комментарий: {order.comment}</p>}
          </section>

          <section className="rounded-lg border border-ink/10 p-4 text-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase text-ink-muted">Итоги</h2>
            <div className="flex justify-between">
              <span className="text-ink-muted">Товары</span>
              <span className="font-mono">{formatPrice(order.subtotal)}</span>
            </div>
            {Number(order.discount_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-muted">Скидка</span>
                <span className="font-mono text-success-700">−{formatPrice(order.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-ink-muted">Доставка</span>
              <span className="font-mono">{formatPrice(order.delivery_cost)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-ink/10 pt-2 font-semibold">
              <span>Итого</span>
              <span className="font-mono">{formatPrice(order.total)}</span>
            </div>
          </section>

          {(transitionTargets.length > 0 || canRefund) && (
            <section className="rounded-lg border border-ink/10 p-4 text-sm">
              <h2 className="mb-2 text-sm font-semibold uppercase text-ink-muted">Действия</h2>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Комментарий (необязательно)"
                rows={2}
                className="mb-3 w-full rounded-lg border border-ink/15 px-2 py-1 text-sm bg-bg"
              />
              <div className="flex flex-wrap gap-2">
                {transitionTargets.map((target) => (
                  <button
                    key={target}
                    type="button"
                    disabled={isBusy}
                    onClick={() => transitionMutation.mutate(target)}
                    className="rounded-lg border border-ink/15 px-3 py-1.5 text-sm hover:border-brand/40 disabled:opacity-50"
                  >
                    → {ORDER_STATUS_LABELS[target] ?? target}
                  </button>
                ))}
                {canRefund && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => refundMutation.mutate()}
                    className="rounded-lg border border-accent-sale/40 px-3 py-1.5 text-sm text-accent-sale-700 hover:border-accent-sale/60 disabled:opacity-50"
                  >
                    Оформить возврат
                  </button>
                )}
              </div>
              {actionError && <p className="mt-2 text-sm text-accent-sale-700">{actionError}</p>}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
