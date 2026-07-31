"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import {
  getAdminProduct,
  listAdminProducts,
  updateAdminVariant,
  type AdminProductVariant,
} from "@/entities/product/adminApi";

function VariantRow({
  productId,
  variant,
}: {
  productId: string;
  variant: AdminProductVariant;
}) {
  const queryClient = useQueryClient();
  const [price, setPrice] = useState(variant.price);
  const [stockQty, setStockQty] = useState(String(variant.stock_qty));
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      updateAdminVariant(productId, variant.id, { price, stock_qty: Number(stockQty) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-product", productId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  const optionsLabel = Object.values(variant.options).map(String).join(", ");

  return (
    <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
      <td className="px-3 py-2">{variant.sku}</td>
      <td className="px-3 py-2">{optionsLabel}</td>
      <td className="px-3 py-2">
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={stockQty}
          onChange={(event) => setStockQty(event.target.value)}
          className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="rounded border border-zinc-300 px-2 py-1 text-xs hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700"
        >
          {mutation.isPending ? "…" : saved ? "Сохранено ✓" : "Сохранить"}
        </button>
      </td>
    </tr>
  );
}

function ProductVariantsPanel({ productId }: { productId: string }) {
  const { data: product, isLoading } = useQuery({
    queryKey: ["admin-product", productId],
    queryFn: () => getAdminProduct(productId),
  });

  if (isLoading) return <p className="p-3 text-sm text-zinc-500">Загрузка вариантов…</p>;
  if (!product) return null;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-zinc-500">
          <th className="px-3 py-1">SKU</th>
          <th className="px-3 py-1">Опции</th>
          <th className="px-3 py-1">Цена</th>
          <th className="px-3 py-1">Остаток</th>
          <th className="px-3 py-1" />
        </tr>
      </thead>
      <tbody>
        {product.variants.map((variant) => (
          <VariantRow key={variant.id} productId={productId} variant={variant} />
        ))}
      </tbody>
    </table>
  );
}

export default function AdminProductsPage() {
  const role = useAuthStore((state) => state.role);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => listAdminProducts(1, 100),
    enabled: role === "admin",
  });

  if (role !== "admin") {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Товары</h1>
        <p className="text-zinc-500">
          Управление товарами доступно только роли «admin» (ТЗ 6.4).
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Товары</h1>
      {isLoading && <p className="text-zinc-500">Загрузка…</p>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-3 py-2">Название</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((product) => (
                <Fragment key={product.id}>
                  <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                    <td className="px-3 py-2">{product.name}</td>
                    <td className="px-3 py-2">{product.is_active ? "активен" : "скрыт"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(expandedId === product.id ? null : product.id)
                        }
                        className="text-sm text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                      >
                        {expandedId === product.id ? "Скрыть варианты" : "Варианты"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === product.id && (
                    <tr>
                      <td colSpan={3} className="bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
                        <ProductVariantsPanel productId={product.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
