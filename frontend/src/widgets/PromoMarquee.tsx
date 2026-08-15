"use client";

import { useCheckoutConfigQuery } from "@/entities/orders/queries";
import { formatPrice } from "@/shared/lib/formatPrice";

// Real, factual claims only -- no fabricated deadlines/addresses/discounts.
// free_delivery_threshold comes from the same config the checkout form uses;
// the other two are static because cash-on-delivery and pickup are both
// always-on features of this store, not something that could go stale.
function useMarqueeItems(): string[] {
  const { data: config } = useCheckoutConfigQuery();
  const items = ["Оплата при получении", "Самовывоз или доставка по Бишкеку"];
  if (config) {
    items.unshift(`Бесплатная доставка от ${formatPrice(config.free_delivery_threshold)}`);
  }
  return items;
}

function MarqueeTrack({ items }: { items: string[] }) {
  return (
    <div className="flex w-1/2 shrink-0 items-center gap-11 whitespace-nowrap pr-11 font-display text-[13px] font-bold">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-11">
          <span>{item}</span>
          <span aria-hidden="true" className="opacity-50">
            ◆
          </span>
        </span>
      ))}
    </div>
  );
}

export function PromoMarquee() {
  const items = useMarqueeItems();

  return (
    <div className="flex h-9 items-center overflow-hidden bg-accent-sale text-white">
      <div className="flex w-[200%] animate-marquee">
        <MarqueeTrack items={items} />
        <MarqueeTrack items={items} />
      </div>
    </div>
  );
}
