import { Home } from "lucide-react";
import Link from "next/link";

import { getCategoryTree, type CategoryNode } from "@/entities/category/api";

const CUSTOMER_LINKS = ["Доставка и оплата", "Возврат", "Оптовым клиентам", "Контакты"];
// Placeholder until real contacts are wired up (see CHANGELOG) -- not a real number/hours.
const CONTACT_PHONE = "+996 555 12-34-56";
const CONTACT_HOURS = "9:00–20:00";
const SOCIAL_LABELS = ["WhatsApp", "Telegram", "Instagram"];

async function safeCategoryTree(): Promise<CategoryNode[]> {
  try {
    return await getCategoryTree();
  } catch {
    return [];
  }
}

export async function Footer() {
  const categories = await safeCategoryTree();

  return (
    <footer className="border-t border-border bg-ink pb-24 pt-9 text-white lg:pb-9">
      <div className="mx-auto grid max-w-[1440px] gap-7 px-4 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand">
              <Home className="h-[18px] w-[18px] text-white" strokeWidth={2.4} aria-hidden="true" />
            </span>
            <span className="font-display text-xl font-extrabold">
              Hobby<span className="text-brand">Life</span>
            </span>
          </div>
          <p className="max-w-[280px] text-[13px] leading-[1.55] text-white/60">
            Товары для дома из пластика в Бишкеке.
          </p>
        </div>

        {categories.length > 0 && (
          <div className="flex flex-col gap-2.5 text-[13px]">
            <p className="mb-0.5 font-display font-extrabold">Каталог</p>
            {categories.slice(0, 5).map((category) => (
              <Link
                key={category.id}
                href={`/catalog/${category.slug}`}
                className="text-white/65 hover:text-white hover:underline"
              >
                {category.name}
              </Link>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2.5 text-[13px]">
          <p className="mb-0.5 font-display font-extrabold">Покупателям</p>
          {CUSTOMER_LINKS.map((label) => (
            <a key={label} href="#" className="text-white/65 hover:text-white hover:underline">
              {label}
            </a>
          ))}
        </div>

        <div className="flex flex-col gap-2.5">
          <p className="font-display text-[13px] font-extrabold">Заказ по телефону</p>
          <p className="font-mono text-xl font-bold text-brand">{CONTACT_PHONE}</p>
          <p className="text-xs text-white/60">Ежедневно {CONTACT_HOURS}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {SOCIAL_LABELS.map((label) => (
              <span
                key={label}
                className="flex h-[34px] items-center rounded-lg bg-white/10 px-3 font-display text-xs font-bold"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-[1440px] border-t border-white/10 px-4 pt-3 text-xs text-white/40">
        © {new Date().getFullYear()} HobbyLife. Все права защищены.
      </div>
    </footer>
  );
}
