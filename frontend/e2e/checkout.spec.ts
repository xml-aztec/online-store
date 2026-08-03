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

async function registerThroughCheckoutGate(
  page: import("@playwright/test").Page,
  email: string
): Promise<void> {
  await page.getByRole("link", { name: "Зарегистрироваться" }).click();
  await page.waitForURL("**/register**");
  await page.fill("#fullName", "E2E Buyer");
  await page.fill("#email", email);
  await page.fill("#password", "TestPass123");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await page.waitForURL("**/checkout");
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

  // Checkout now requires an account -- register through the login gate. The
  // guest cart merges into the new account on login, so the item added above
  // is still there once the checkout form appears.
  await registerThroughCheckoutGate(page, `e2e-${Date.now()}@example.com`);

  await page.fill("#phone", "+996700000000");
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

  // A competing buyer (a genuinely separate session/cart, authenticated via
  // its own account since checkout requires login) buys the exact same stock
  // first, simulating a race that the browser's checkout must lose.
  const competitorEmail = `competitor-${Date.now()}@example.com`;
  const competitorRegister = await request.post("/api/v1/auth/register", {
    data: { email: competitorEmail, password: "TestPass123", full_name: "Конкурент" },
  });
  expect(competitorRegister.ok()).toBeTruthy();
  const competitorLogin = await request.post("/api/v1/auth/login", {
    data: { email: competitorEmail, password: "TestPass123" },
  });
  expect(competitorLogin.ok()).toBeTruthy();
  const { access_token: competitorToken } = (await competitorLogin.json()) as {
    access_token: string;
  };
  const competitorHeaders = { Authorization: `Bearer ${competitorToken}` };

  const competitorAdd = await request.post("/api/v1/cart/items", {
    data: { variant_id: variant.id, qty: stockQty },
    headers: competitorHeaders,
  });
  expect(competitorAdd.ok()).toBeTruthy();
  const competitorCheckout = await request.post("/api/v1/orders", {
    data: {
      email: competitorEmail,
      phone: "+996700000001",
      full_name: "Конкурент",
      delivery_method: "pickup",
      payment_method: "cash_on_delivery",
    },
    headers: competitorHeaders,
  });
  expect(competitorCheckout.ok()).toBeTruthy();

  await page.goto("/checkout");
  await registerThroughCheckoutGate(page, `e2e-conflict-${Date.now()}@example.com`);

  await page.fill("#phone", "+996700000002");
  await page.getByRole("button", { name: "Оплатить" }).click();

  await expect(
    page.getByText("Некоторые товары недоступны в нужном количестве")
  ).toBeVisible();
});
