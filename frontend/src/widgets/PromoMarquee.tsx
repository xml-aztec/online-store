import { getCheckoutConfig, type CheckoutConfig } from "@/entities/orders/api";
import { getPromoMessages } from "@/entities/promoMessage/api";
import { formatPrice } from "@/shared/lib/formatPrice";

async function safeCheckoutConfig(): Promise<CheckoutConfig | null> {
  try {
    return await getCheckoutConfig();
  } catch {
    return null;
  }
}

async function safePromoMessages(): Promise<string[]> {
  try {
    return (await getPromoMessages()).map((item) => item.message);
  } catch {
    return [];
  }
}

// Real, factual claims only -- no fabricated deadlines/addresses/discounts.
// Used only while nothing is configured in /admin/promo-messages, so the
// strip is never empty on a fresh store.
function defaultItems(config: CheckoutConfig | null): string[] {
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

export async function PromoMarquee() {
  const [config, configured] = await Promise.all([safeCheckoutConfig(), safePromoMessages()]);
  const items = configured.length > 0 ? configured : defaultItems(config);

  return (
    <div className="flex h-9 items-center overflow-hidden bg-accent-sale text-white">
      <div className="flex w-[200%] animate-marquee">
        <MarqueeTrack items={items} />
        <MarqueeTrack items={items} />
      </div>
    </div>
  );
}
