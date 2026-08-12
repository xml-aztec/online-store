"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect } from "react";

import { getAdminOrder } from "@/entities/orders/adminApi";
import { Drawer } from "@/shared/ui/Drawer";
import { StatusPill } from "@/shared/ui/StatusPill";
import { OrderDetailContent } from "@/widgets/OrderDetailContent";

interface OrderDrawerProps {
  orderId: string | null;
  /** Ids of the currently loaded/filtered list on the page behind the drawer,
   * in display order -- powers ↑/↓ prev/next without a dedicated endpoint. */
  orderIds: string[];
  onClose: () => void;
  onNavigate: (orderId: string) => void;
}

export function OrderDrawer({ orderId, orderIds, onClose, onNavigate }: OrderDrawerProps) {
  const { data: order } = useQuery({
    queryKey: ["admin-order", orderId],
    queryFn: () => getAdminOrder(orderId as string),
    enabled: orderId !== null,
  });

  const index = orderId ? orderIds.indexOf(orderId) : -1;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < orderIds.length - 1;

  useEffect(() => {
    if (!orderId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable) return;
      }
      if (event.key === "ArrowUp" && hasPrev) {
        event.preventDefault();
        onNavigate(orderIds[index - 1]);
      } else if (event.key === "ArrowDown" && hasNext) {
        event.preventDefault();
        onNavigate(orderIds[index + 1]);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [orderId, hasPrev, hasNext, index, orderIds, onNavigate]);

  return (
    <Drawer
      open={orderId !== null}
      onClose={onClose}
      width={460}
      title={
        order && (
          <>
            <span className="font-mono text-base font-bold text-ink">№ {order.number}</span>
            <StatusPill status={order.status} size="md" />
          </>
        )
      }
      headerExtra={
        index >= 0 && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              title="Предыдущий (↑)"
              disabled={!hasPrev}
              onClick={() => hasPrev && onNavigate(orderIds[index - 1])}
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink hover:bg-surface disabled:opacity-30"
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Следующий (↓)"
              disabled={!hasNext}
              onClick={() => hasNext && onNavigate(orderIds[index + 1])}
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink hover:bg-surface disabled:opacity-30"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <span className="px-1.5 font-mono text-[10px] text-ink-muted">
              {index + 1} / {orderIds.length}
            </span>
          </span>
        )
      }
    >
      {orderId && <OrderDetailContent orderId={orderId} />}
    </Drawer>
  );
}
