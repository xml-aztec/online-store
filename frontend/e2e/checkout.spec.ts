import { expect, test } from "@playwright/test";

interface ProductListResponse {
  items: { slug: string }[];
}

interface ProductVariant {
  id: string;
  is_available: boolean;
  stock_qty: number;
}

interface ProductDetail {
  variants: ProductVariant[];
}

test("catalog -> cart -> checkout (cash on delivery) -> success page with order number", async ({
  page,
}) => {
  await page.goto("/catalog");
  await page.locator("a[href^='/product/']").first().click();

  await page.getByRole("button", { name: "Добавить в корзину" }).click();
  await expect(page.getByText("Добавлено в корзину")).toBeVisible();

  await page.getByRole("link", { name: /Корзина/ }).click();
  await page.waitForURL("**/cart");
  await expect(page.getByText("Итого")).toBeVisible();

  await page.getByRole("link", { name: "Оформить заказ" }).click();
  await page.waitForURL("**/checkout");

  await page.fill("#email", `e2e-${Date.now()}@example.com`);
  await page.fill("#phone", "+996700000000");
  await page.fill("#full_name", "E2E Buyer");
  await page.getByRole("button", { name: "Оплатить" }).click();

  await page.waitForURL("**/checkout/success/**", { timeout: 15000 });
  await expect(page.getByText(/Номер заказа: ORD-/)).toBeVisible();
});

test("a competing checkout draining stock shows a readable 409 on checkout", async ({
  page,
  request,
}) => {
  const listResponse = await page.request.get("/api/v1/products?page_size=1");
  const { items } = (await listResponse.json()) as ProductListResponse;
  const slug = items[0].slug;

  const detailResponse = await page.request.get(`/api/v1/products/${slug}`);
  const detail = (await detailResponse.json()) as ProductDetail;
  const variant = detail.variants.find((v) => v.is_available && v.stock_qty > 0);
  expect(variant).toBeTruthy();
  if (!variant) throw new Error("no available variant found for e2e setup");

  const stockQty = variant.stock_qty;

  // The browser's own cart claims all remaining stock.
  const addResponse = await page.request.post("/api/v1/cart/items", {
    data: { variant_id: variant.id, qty: stockQty },
  });
  expect(addResponse.ok()).toBeTruthy();

  // A competing buyer (a genuinely separate session/cart) buys the exact same
  // stock first, simulating a race that the browser's checkout must lose.
  const competitorAdd = await request.post("/api/v1/cart/items", {
    data: { variant_id: variant.id, qty: stockQty },
  });
  expect(competitorAdd.ok()).toBeTruthy();
  const competitorCheckout = await request.post("/api/v1/orders", {
    data: {
      email: `competitor-${Date.now()}@example.com`,
      phone: "+996700000001",
      full_name: "Конкурент",
      delivery_method: "pickup",
      payment_method: "cash_on_delivery",
    },
  });
  expect(competitorCheckout.ok()).toBeTruthy();

  await page.goto("/checkout");
  await page.fill("#email", `e2e-conflict-${Date.now()}@example.com`);
  await page.fill("#phone", "+996700000002");
  await page.fill("#full_name", "E2E Buyer");
  await page.getByRole("button", { name: "Оплатить" }).click();

  await expect(
    page.getByText("Некоторые товары недоступны в нужном количестве")
  ).toBeVisible();
});
