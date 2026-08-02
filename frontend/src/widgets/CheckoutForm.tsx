"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { CART_QUERY_KEY, useCartQuery } from "@/entities/cart/queries";
import type { CheckoutRequest } from "@/entities/orders/api";
import { useCheckoutConfigQuery, useCheckoutMutation } from "@/entities/orders/queries";
import { formatPrice } from "@/shared/lib/formatPrice";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash_on_delivery: "Оплата при получении",
  online: "Онлайн-оплата",
};

const INPUT_CLASS =
  "w-full rounded-lg border border-ink/15 bg-bg px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";
const LABEL_CLASS = "mb-1 block text-sm text-ink-muted";
const LEGEND_CLASS = "mb-1 font-display text-base font-semibold text-ink";
const RADIO_ROW_CLASS = "flex items-center gap-2 text-sm text-ink";
const RADIO_CLASS = "accent-brand";

const addressSchema = z.object({
  city: z.string().min(1, "Укажите город"),
  street: z.string().min(1, "Укажите улицу"),
  building: z.string().min(1, "Укажите дом"),
  apartment: z.string().optional(),
  postal_code: z.string().optional(),
});

const checkoutSchema = z
  .object({
    email: z.string().email("Введите корректный email"),
    phone: z.string().min(5, "Введите номер телефона"),
    full_name: z.string().min(2, "Введите имя"),
    delivery_method: z.enum(["pickup", "courier"]),
    payment_method: z.enum(["cash_on_delivery", "online"]),
    comment: z.string().optional(),
    city: z.string().optional(),
    street: z.string().optional(),
    building: z.string().optional(),
    apartment: z.string().optional(),
    postal_code: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.delivery_method !== "courier") return;
    const result = addressSchema.safeParse({
      city: data.city,
      street: data.street,
      building: data.building,
      apartment: data.apartment,
      postal_code: data.postal_code,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: issue.path });
      }
    }
  });

type FormState = z.infer<typeof checkoutSchema>;

const INITIAL_STATE: FormState = {
  email: "",
  phone: "",
  full_name: "",
  delivery_method: "pickup",
  payment_method: "cash_on_delivery",
  comment: "",
  city: "",
  street: "",
  building: "",
  apartment: "",
  postal_code: "",
};

export function CheckoutForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: cart } = useCartQuery();
  const { data: config } = useCheckoutConfigQuery();
  const checkoutMutation = useCheckoutMutation();

  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const subtotal = cart ? Number(cart.subtotal) : 0;
  const freeThreshold = config ? Number(config.free_delivery_threshold) : undefined;
  const courierCost = config ? Number(config.courier_delivery_cost) : undefined;
  const courierCostLabel =
    freeThreshold !== undefined && courierCost !== undefined
      ? subtotal >= freeThreshold
        ? "бесплатно"
        : formatPrice(String(courierCost))
      : null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = checkoutSchema.safeParse(form);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path.join(".")] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const payload: CheckoutRequest = {
      email: parsed.data.email,
      phone: parsed.data.phone,
      full_name: parsed.data.full_name,
      delivery_method: parsed.data.delivery_method,
      payment_method: parsed.data.payment_method,
      comment: parsed.data.comment || null,
      address:
        parsed.data.delivery_method === "courier"
          ? {
              city: parsed.data.city ?? "",
              street: parsed.data.street ?? "",
              building: parsed.data.building ?? "",
              apartment: parsed.data.apartment || null,
              postal_code: parsed.data.postal_code || null,
            }
          : null,
    };

    checkoutMutation.mutate(payload, {
      onSuccess: (data) => {
        void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
        const emailParam = encodeURIComponent(parsed.data.email);
        if (data.payment_url) {
          window.location.href = data.payment_url;
        } else {
          router.push(`/checkout/success/${data.number}?email=${emailParam}`);
        }
      },
    });
  }

  if (cart && cart.items.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-ink-muted">Корзина пуста — оформить заказ не получится.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <fieldset className="space-y-3">
          <legend className={LEGEND_CLASS}>Контакты</legend>
          <div>
            <label htmlFor="email" className={LABEL_CLASS}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              className={INPUT_CLASS}
            />
            {fieldErrors.email && <p className="mt-1 text-xs text-accent-sale-700">{fieldErrors.email}</p>}
          </div>
          <div>
            <label htmlFor="phone" className={LABEL_CLASS}>
              Телефон
            </label>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              className={INPUT_CLASS}
            />
            {fieldErrors.phone && <p className="mt-1 text-xs text-accent-sale-700">{fieldErrors.phone}</p>}
          </div>
          <div>
            <label htmlFor="full_name" className={LABEL_CLASS}>
              Имя
            </label>
            <input
              id="full_name"
              type="text"
              value={form.full_name}
              onChange={(event) => update("full_name", event.target.value)}
              className={INPUT_CLASS}
            />
            {fieldErrors.full_name && (
              <p className="mt-1 text-xs text-accent-sale-700">{fieldErrors.full_name}</p>
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className={LEGEND_CLASS}>Способ доставки</legend>
          <label className={RADIO_ROW_CLASS}>
            <input
              type="radio"
              name="delivery_method"
              checked={form.delivery_method === "pickup"}
              onChange={() => update("delivery_method", "pickup")}
              className={RADIO_CLASS}
            />
            Самовывоз — бесплатно
          </label>
          <label className={RADIO_ROW_CLASS}>
            <input
              type="radio"
              name="delivery_method"
              checked={form.delivery_method === "courier"}
              onChange={() => update("delivery_method", "courier")}
              className={RADIO_CLASS}
            />
            Курьером{courierCostLabel ? ` — ${courierCostLabel}` : ""}
          </label>

          {form.delivery_method === "courier" && (
            <div className="mt-2 space-y-2 border-l-2 border-ink/10 pl-4">
              <div>
                <input
                  type="text"
                  placeholder="Город"
                  value={form.city}
                  onChange={(event) => update("city", event.target.value)}
                  className={INPUT_CLASS}
                />
                {fieldErrors["city"] && (
                  <p className="mt-1 text-xs text-accent-sale-700">{fieldErrors["city"]}</p>
                )}
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Улица"
                  value={form.street}
                  onChange={(event) => update("street", event.target.value)}
                  className={INPUT_CLASS}
                />
                {fieldErrors["street"] && (
                  <p className="mt-1 text-xs text-accent-sale-700">{fieldErrors["street"]}</p>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Дом"
                  value={form.building}
                  onChange={(event) => update("building", event.target.value)}
                  className={INPUT_CLASS}
                />
                <input
                  type="text"
                  placeholder="Квартира"
                  value={form.apartment}
                  onChange={(event) => update("apartment", event.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              {fieldErrors["building"] && (
                <p className="mt-1 text-xs text-accent-sale-700">{fieldErrors["building"]}</p>
              )}
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className={LEGEND_CLASS}>Способ оплаты</legend>
          {(config?.payment_methods ?? ["cash_on_delivery"]).map((method) => (
            <label key={method} className={RADIO_ROW_CLASS}>
              <input
                type="radio"
                name="payment_method"
                checked={form.payment_method === method}
                onChange={() => update("payment_method", method)}
                className={RADIO_CLASS}
              />
              {PAYMENT_METHOD_LABELS[method] ?? method}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <label htmlFor="comment" className={LABEL_CLASS}>
            Комментарий к заказу
          </label>
          <textarea
            id="comment"
            value={form.comment}
            onChange={(event) => update("comment", event.target.value)}
            rows={3}
            className={INPUT_CLASS}
          />
        </fieldset>
      </div>

      <aside className="h-fit rounded-xl border border-ink/10 p-4 lg:sticky lg:top-24">
        {cart && (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Товары</dt>
              <dd className="font-mono text-ink">{formatPrice(cart.subtotal)}</dd>
            </div>
            {Number(cart.discount_amount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Скидка</dt>
                <dd className="font-mono text-success-700">−{formatPrice(cart.discount_amount)}</dd>
              </div>
            )}
          </dl>
        )}

        {checkoutMutation.isError && (
          <p className="mt-3 rounded-lg bg-accent-sale/10 p-3 text-sm text-accent-sale-700">
            {checkoutMutation.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={checkoutMutation.isPending || !cart || cart.items.length === 0}
          className="mt-4 w-full rounded-lg bg-brand px-4 py-3 text-sm font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {checkoutMutation.isPending ? "Оформляем…" : "Оплатить"}
        </button>
      </aside>
    </form>
  );
}
