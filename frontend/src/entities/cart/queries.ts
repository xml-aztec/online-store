"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/shared/api/client";

import { addCartItem, applyCartPromo, clearCart, getCart, updateCartItem } from "./api";
import type { Cart, CartItem } from "./api";

export const CART_QUERY_KEY = ["cart"] as const;

export function useCartQuery() {
  return useQuery({ queryKey: CART_QUERY_KEY, queryFn: getCart });
}

function recomputeTotals(items: CartItem[], previous: Cart): Cart {
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
  const discount = Number(previous.discount_amount);
  return {
    ...previous,
    items,
    subtotal: subtotal.toFixed(2),
    total: (subtotal - discount).toFixed(2),
  };
}

interface OptimisticNewItem {
  product_id: string;
  product_name: string;
  product_slug: string;
  sku: string;
  options: Record<string, unknown>;
  image_url: string | null;
  price: string;
}

interface AddCartItemVariables {
  variantId: string;
  qty: number;
  /** Only needed when the variant isn't already a cart line -- lets the header/
   * cart page show the new item immediately instead of waiting on a refetch. */
  newItem?: OptimisticNewItem;
}

interface MutationContext {
  previous: Cart | undefined;
}

export function useAddCartItemMutation() {
  const queryClient = useQueryClient();

  return useMutation<Cart, ApiError, AddCartItemVariables, MutationContext>({
    mutationFn: ({ variantId, qty }) => addCartItem(variantId, qty),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY });
      const previous = queryClient.getQueryData<Cart>(CART_QUERY_KEY);

      if (previous) {
        const alreadyInCart = previous.items.some((item) => item.variant_id === vars.variantId);
        let items = previous.items;

        if (alreadyInCart) {
          items = previous.items.map((item) =>
            item.variant_id === vars.variantId
              ? {
                  ...item,
                  qty: item.qty + vars.qty,
                  line_total: (Number(item.price) * (item.qty + vars.qty)).toFixed(2),
                }
              : item
          );
        } else if (vars.newItem) {
          const optimisticItem: CartItem = {
            variant_id: vars.variantId,
            product_id: vars.newItem.product_id,
            product_name: vars.newItem.product_name,
            product_slug: vars.newItem.product_slug,
            sku: vars.newItem.sku,
            options: vars.newItem.options,
            image_url: vars.newItem.image_url,
            price: vars.newItem.price,
            qty: vars.qty,
            line_total: (Number(vars.newItem.price) * vars.qty).toFixed(2),
            is_available: true,
            available_qty: vars.qty,
          };
          items = [...previous.items, optimisticItem];
        }

        queryClient.setQueryData<Cart>(CART_QUERY_KEY, recomputeTotals(items, previous));
      }

      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(CART_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
    },
  });
}

interface UpdateCartItemVariables {
  variantId: string;
  qty: number;
}

export function useUpdateCartItemMutation() {
  const queryClient = useQueryClient();

  return useMutation<Cart, ApiError, UpdateCartItemVariables, MutationContext>({
    mutationFn: ({ variantId, qty }) => updateCartItem(variantId, qty),
    onMutate: async ({ variantId, qty }) => {
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY });
      const previous = queryClient.getQueryData<Cart>(CART_QUERY_KEY);

      if (previous) {
        const items =
          qty <= 0
            ? previous.items.filter((item) => item.variant_id !== variantId)
            : previous.items.map((item) =>
                item.variant_id === variantId
                  ? { ...item, qty, line_total: (Number(item.price) * qty).toFixed(2) }
                  : item
              );
        queryClient.setQueryData<Cart>(CART_QUERY_KEY, recomputeTotals(items, previous));
      }

      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(CART_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
    },
  });
}

export function useClearCartMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, void, MutationContext>({
    mutationFn: clearCart,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY });
      const previous = queryClient.getQueryData<Cart>(CART_QUERY_KEY);
      queryClient.setQueryData<Cart>(CART_QUERY_KEY, {
        items: [],
        subtotal: "0",
        promo_code: null,
        discount_amount: "0",
        total: "0",
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(CART_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
    },
  });
}

// Discount depends on percent-vs-fixed promo details the client doesn't have,
// so this one applies the server's real response rather than guessing an
// optimistic total.
export function useApplyPromoMutation() {
  const queryClient = useQueryClient();

  return useMutation<Cart, ApiError, string>({
    mutationFn: (code: string) => applyCartPromo(code),
    onSuccess: (data) => {
      queryClient.setQueryData(CART_QUERY_KEY, data);
    },
  });
}

export function cartItemCount(cart: Cart | undefined): number {
  if (!cart) return 0;
  return cart.items.reduce((sum, item) => sum + item.qty, 0);
}
