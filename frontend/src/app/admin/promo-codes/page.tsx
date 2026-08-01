"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import {
  createAdminPromoCode,
  deleteAdminPromoCode,
  listAdminPromoCodes,
  updateAdminPromoCode,
  type AdminPromoCode,
} from "@/entities/promoCode/adminApi";
import { ApiError } from "@/shared/api/client";

const QUERY_KEY = ["admin-promo-codes"];

function PromoCodeRow({ promo }: { promo: AdminPromoCode }) {
  const queryClient = useQueryClient();
  const [discountValue, setDiscountValue] = useState(promo.discount_value);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateAdminPromoCode>[1]) =>
      updateAdminPromoCode(promo.id, payload),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminPromoCode(promo.id),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить");
    },
  });

  return (
    <tr className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900">
      <td className="px-3 py-2 font-mono text-sm">{promo.code}</td>
      <td className="px-3 py-2">{promo.discount_type === "percent" ? "%" : "сом"}</td>
      <td className="px-3 py-2">
        <input
          value={discountValue}
          onChange={(event) => setDiscountValue(event.target.value)}
          className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </td>
      <td className="px-3 py-2 text-sm text-zinc-500">{promo.min_order_total ?? "—"}</td>
      <td className="px-3 py-2 text-sm text-zinc-500">{promo.max_uses ?? "∞"}</td>
      <td className="px-3 py-2 text-sm text-zinc-500">{promo.used_count}</td>
      <td className="px-3 py-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={promo.is_active}
            onChange={(event) => updateMutation.mutate({ is_active: event.target.checked })}
          />
          активен
        </label>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => updateMutation.mutate({ discount_value: discountValue })}
            disabled={updateMutation.isPending}
            className="rounded border border-zinc-300 px-2 py-1 text-xs hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700"
          >
            Сохранить
          </button>
          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:border-red-400 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
          >
            Удалить
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </td>
    </tr>
  );
}

function CreatePromoCodeForm() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [minOrderTotal, setMinOrderTotal] = useState("");
  const [maxUses, setMaxUses] = useState("");

  const mutation = useMutation({
    mutationFn: createAdminPromoCode,
    onSuccess: () => {
      setCode("");
      setDiscountValue("10");
      setMinOrderTotal("");
      setMaxUses("");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      code,
      discount_type: discountType,
      discount_value: discountValue,
      min_order_total: minOrderTotal || null,
      max_uses: maxUses ? Number(maxUses) : null,
      is_active: true,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Код</label>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
          className="w-36 rounded border border-zinc-300 px-2 py-1 text-sm uppercase dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Тип</label>
        <select
          value={discountType}
          onChange={(event) => setDiscountType(event.target.value as "percent" | "fixed")}
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="percent">Процент</option>
          <option value="fixed">Фиксированная</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Размер скидки</label>
        <input
          value={discountValue}
          onChange={(event) => setDiscountValue(event.target.value)}
          required
          className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Мин. сумма заказа</label>
        <input
          value={minOrderTotal}
          onChange={(event) => setMinOrderTotal(event.target.value)}
          placeholder="—"
          className="w-28 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Лимит использований</label>
        <input
          value={maxUses}
          onChange={(event) => setMaxUses(event.target.value)}
          placeholder="∞"
          className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {mutation.isPending ? "Создание…" : "Создать промокод"}
      </button>
      {mutation.isError && (
        <p className="w-full text-sm text-red-600 dark:text-red-400">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : "Не удалось создать промокод"}
        </p>
      )}
    </form>
  );
}

export default function AdminPromoCodesPage() {
  const role = useAuthStore((state) => state.role);
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listAdminPromoCodes(1, 100),
    enabled: role === "admin",
  });

  if (role !== "admin") {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Промокоды</h1>
        <p className="text-zinc-500">Управление промокодами доступно только роли «admin» (ТЗ 6.4).</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Промокоды</h1>

      <CreatePromoCodeForm />

      {isLoading && <p className="text-zinc-500">Загрузка…</p>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-3 py-2">Код</th>
                <th className="px-3 py-2">Тип</th>
                <th className="px-3 py-2">Размер</th>
                <th className="px-3 py-2">Мин. сумма</th>
                <th className="px-3 py-2">Лимит</th>
                <th className="px-3 py-2">Использовано</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((promo) => (
                <PromoCodeRow key={promo.id} promo={promo} />
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && (
            <p className="p-4 text-center text-zinc-500">Промокодов пока нет</p>
          )}
        </div>
      )}
    </div>
  );
}
