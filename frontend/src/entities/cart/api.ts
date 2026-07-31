import { apiFetch } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type Cart = components["schemas"]["CartResponse"];
export type CartItem = components["schemas"]["CartItemResponse"];

export async function getCart(): Promise<Cart> {
  return apiFetch<Cart>("/cart");
}

export async function addCartItem(variantId: string, qty: number): Promise<Cart> {
  return apiFetch<Cart>("/cart/items", {
    method: "POST",
    body: JSON.stringify({ variant_id: variantId, qty }),
  });
}

export async function updateCartItem(variantId: string, qty: number): Promise<Cart> {
  return apiFetch<Cart>(`/cart/items/${variantId}`, {
    method: "PATCH",
    body: JSON.stringify({ qty }),
  });
}

export async function clearCart(): Promise<void> {
  await apiFetch<void>("/cart", { method: "DELETE" });
}

export async function applyCartPromo(code: string): Promise<Cart> {
  return apiFetch<Cart>("/cart/promo", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}
