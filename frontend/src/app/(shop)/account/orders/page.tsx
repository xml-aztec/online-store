"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { DELIVERY_METHOD_LABELS, listMyOrders } from "@/entities/orders/api";
import { formatPrice } from "@/shared/lib/formatPrice";
import { pluralizeRu } from "@/shared/lib/pluralizeRu";
import { StatusPill } from "@/shared/ui/StatusPill";

function OrdersSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Загрузка заказов">
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-bg px-5 py-4 sm:flex-nowrap sm:gap-5"
        >
          <div className="flex w-[150px] shrink-0 flex-col gap-1.5">
            <div className="h-4 w-20 animate-pulse rounded bg-surface" />
            <div className="h-3 w-16 animate-pulse rounded bg-surface" />
          </div>
          <div className="h-6 w-24 shrink-0 animate-pulse rounded-full bg-surface" />
          <div className="h-3 min-w-0 flex-1 basis-full animate-pulse rounded bg-surface sm:basis-auto" />
          <div className="h-4 w-16 shrink-0 animate-pulse rounded bg-surface" />
        </div>
      ))}
    </div>
  );
}

export default function AccountOrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => listMyOrders(1, 50),
  });

  return (
    <div>
      <h2 className="mb-4 font-display text-lg font-extrabold text-ink">Мои заказы</h2>
      {isLoading && <OrdersSkeleton />}
      {data && data.items.length === 0 && (
        <p className="animate-content-fade-in text-ink-muted">Заказов пока нет</p>
      )}
      {data && data.items.length > 0 && (
        <div className="flex animate-content-fade-in flex-col gap-2.5">
          {data.items.map((order) => (
            <Link
              key={order.number}
              href={`/account/orders/${order.number}`}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-bg px-5 py-4 transition hover:shadow-md sm:gap-5 sm:flex-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <div className="flex w-[150px] shrink-0 flex-col gap-0.5">
                <span className="font-mono text-[15px] font-bold text-ink">
                  № {order.number}
                </span>
                <span className="text-xs text-ink-muted">
                  {new Date(order.created_at).toLocaleDateString("ru-RU")}
                </span>
              </div>
              <StatusPill status={order.status} />
              <span className="min-w-0 flex-1 basis-full text-[13px] text-ink-muted sm:basis-auto">
                {order.item_count} {pluralizeRu(order.item_count, ["товар", "товара", "товаров"])} ·{" "}
                {DELIVERY_METHOD_LABELS[order.delivery_method] ?? order.delivery_method}
              </span>
              <span className="shrink-0 whitespace-nowrap font-mono text-base font-bold text-ink">
                {formatPrice(order.total)}
              </span>
              <ChevronRight
                className="hidden h-[18px] w-[18px] shrink-0 text-ink-muted sm:block"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
