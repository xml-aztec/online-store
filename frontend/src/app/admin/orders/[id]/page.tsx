"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";

import { getAdminOrder } from "@/entities/orders/adminApi";
import { StatusPill } from "@/shared/ui/StatusPill";
import { OrderDetailContent } from "@/widgets/OrderDetailContent";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Standalone deep link (e.g. from a Telegram notification or a bookmarked
 * URL) -- same OrderDetailContent the orders-list drawer renders, just with
 * its own breadcrumb/title chrome instead of the Drawer's. */
export default function AdminOrderDetailPage({ params }: PageProps) {
  const { id } = use(params);

  const { data: order } = useQuery({
    queryKey: ["admin-order", id],
    queryFn: () => getAdminOrder(id),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <Link href="/admin/orders" className="text-[13px] text-ink-muted hover:text-ink">
          ← Заказы
        </Link>
        <h1 className="font-display text-[22px] font-extrabold text-ink">
          Заказ <span className="font-mono">{order?.number ?? id}</span>
        </h1>
        {order && <StatusPill status={order.status} size="md" />}
      </div>
      <div className="max-w-[640px] rounded-xl border border-border bg-bg">
        <OrderDetailContent orderId={id} />
      </div>
    </div>
  );
}
