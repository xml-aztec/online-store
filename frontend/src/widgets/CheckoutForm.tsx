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
        <p className="text-zinc-500">Корзина пуста — оформить заказ не получится.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <fieldset className="space-y-3">
          <legend className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Контакты
          </legend>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
          </div>
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
              Телефон
            </label>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            {fieldErrors.phone && <p className="mt-1 text-xs text-red-600">{fieldErrors.phone}</p>}
          </div>
          <div>
            <label
              htmlFor="full_name"
              className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400"
            >
              Имя
            </label>
            <input
              id="full_name"
              type="text"
              value={form.full_name}
              onChange={(event) => update("full_name", event.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            {fieldErrors.full_name && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.full_name}</p>
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Способ доставки
          </legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="delivery_method"
              checked={form.delivery_method === "pickup"}
              onChange={() => update("delivery_method", "pickup")}
            />
            Самовывоз — бесплатно
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="delivery_method"
              checked={form.delivery_method === "courier"}
              onChange={() => update("delivery_method", "courier")}
            />
            Курьером{courierCostLabel ? ` — ${courierCostLabel}` : ""}
          </label>

          {form.delivery_method === "courier" && (
            <div className="mt-2 space-y-2 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
              <div>
                <input
                  type="text"
                  placeholder="Город"
                  value={form.city}
                  onChange={(event) => update("city", event.target.value)}
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                {fieldErrors["city"] && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors["city"]}</p>
                )}
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Улица"
                  value={form.street}
                  onChange={(event) => update("street", event.target.value)}
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                {fieldErrors["street"] && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors["street"]}</p>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Дом"
                  value={form.building}
                  onChange={(event) => update("building", event.target.value)}
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <input
                  type="text"
                  placeholder="Квартира"
                  value={form.apartment}
                  onChange={(event) => update("apartment", event.target.value)}
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              {fieldErrors["building"] && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors["building"]}</p>
              )}
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Способ оплаты
          </legend>
          {(config?.payment_methods ?? ["cash_on_delivery"]).map((method) => (
            <label key={method} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="payment_method"
                checked={form.payment_method === method}
                onChange={() => update("payment_method", method)}
              />
              {PAYMENT_METHOD_LABELS[method] ?? method}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <label htmlFor="comment" className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
            Комментарий к заказу
          </label>
          <textarea
            id="comment"
            value={form.comment}
            onChange={(event) => update("comment", event.target.value)}
            rows={3}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </fieldset>
      </div>

      <aside className="h-fit rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        {cart && (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Товары</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{formatPrice(cart.subtotal)}</dd>
            </div>
            {Number(cart.discount_amount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Скидка</dt>
                <dd className="text-emerald-600 dark:text-emerald-400">
                  −{formatPrice(cart.discount_amount)}
                </dd>
              </div>
            )}
          </dl>
        )}

        {checkoutMutation.isError && (
          <p className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {checkoutMutation.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={checkoutMutation.isPending || !cart || cart.items.length === 0}
          className="mt-4 w-full rounded bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {checkoutMutation.isPending ? "Оформляем…" : "Оплатить"}
        </button>
      </aside>
    </form>
  );
}
