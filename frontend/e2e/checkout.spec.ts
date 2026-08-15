import { expect, test } from "@playwright/test";

interface ProductListItem {
  slug: string;
  is_available: boolean;
}

interface ProductListResponse {
  items: ProductListItem[];
}

interface ProductVariant {
  id: string;
  is_available: boolean;
  stock_qty: number;
}

interface ProductDetail {
  variants: ProductVariant[];
}

// Resolves a product slug that's actually purchasable right now, instead of
// assuming "first item in the catalog" has stock -- the catalog is real,
// mutable dev/prod data, not a fixture, so that assumption is exactly what
// made this spec flaky (audit finding B.3).
//
// Requires EVERY variant to be in stock, not just "some variant" (product-
// level is_available is bool_or across variants): the product page is SSR +
// ISR (ТЗ 7.1, 60s revalidate), so the purchase panel's default-selected
// variant can briefly reflect a stale snapshot after a stock change. Picking
// a product where all variants are available makes the happy-path test
// immune to which variant that stale default selection happens to land on.
async function findPurchasableProductSlug(page: import("@playwright/test").Page): Promise<string> {
  const listResponse = await page.request.get("/api/v1/products?page_size=50");
  const { items } = (await listResponse.json()) as ProductListResponse;
  for (const item of items.filter((candidate) => candidate.is_available)) {
    const detailResponse = await page.request.get(`/api/v1/products/${item.slug}`);
    const detail = (await detailResponse.json()) as ProductDetail;
    if (detail.variants.length > 0 && detail.variants.every((v) => v.is_available)) {
      return item.slug;
    }
  }
  throw new Error("no product with every variant in stock found for e2e setup");
}

// Same fix, at the variant level: scans candidate products (not just the
// single first one) for the first with a variant that actually has stock.
async function findPurchasableVariant(
  page: import("@playwright/test").Page
): Promise<{ slug: string; variant: ProductVariant }> {
  const listResponse = await page.request.get("/api/v1/products?page_size=50");
  const { items } = (await listResponse.json()) as ProductListResponse;
  for (const item of items.filter((candidate) => candidate.is_available)) {
    const detailResponse = await page.request.get(`/api/v1/products/${item.slug}`);
    const detail = (await detailResponse.json()) as ProductDetail;
    const variant = detail.variants.find((v) => v.is_available && v.stock_qty > 0);
    if (variant) return { slug: item.slug, variant };
  }
  throw new Error("no product with a purchasable variant found for e2e setup");
}

test("catalog -> cart -> checkout (cash on delivery) -> success page with order number", async ({
  page,
}) => {
  // Default 30s can be tight in dev Docker: findPurchasableProductSlug now
  // makes a sequential detail request per candidate product to find one
  // where every variant is in stock (see its comment), on top of the usual
  // page-navigation round trips.
  test.setTimeout(60_000);

  const slug = await findPurchasableProductSlug(page);
  await page.goto(`/product/${slug}`);

  // Scoped to the purchase panel: a bare getByRole('button', {name:
  // 'Добавить в корзину'}) also matches the "С этим покупают" recommendation
  // grid's quick-add buttons (aria-label "Быстро добавить в корзину" --
  // Playwright's default name match is a case-insensitive substring, so it
  // contains this string too), which made this locator resolve to multiple
  // elements whenever the current product had in-stock recommendations.
  const purchasePanel = page.getByTestId("product-purchase-panel");
  await purchasePanel.getByRole("button", { name: "Добавить в корзину" }).click();
  await expect(page.getByText("Добавлено в корзину")).toBeVisible();

  // Scoped to the header (<header>, implicit role "banner") -- a bare
  // getByRole('link', {name: /Корзина/}) also matches any recommended
  // product literally named "Корзина ..." ("Корзина для белья складная" is a
  // real catalog item), since "Корзина" is both the nav label and a common
  // Russian product-name word.
  await page.getByRole("banner").getByRole("link", { name: /Корзина/ }).click();
  await page.waitForURL("**/cart");
  // Scoped to the summary sidebar (<aside>, implicit role "complementary") --
  // a bare getByText("Итого") also matches the mobile sticky bar's label,
  // which is always present in the DOM (CSS-hidden via lg:hidden at desktop
  // viewport widths, but Playwright's strict-mode locator resolution counts
  // it regardless of visibility), so it resolves to 2 elements.
  await expect(page.getByRole("complementary").getByText("Итого")).toBeVisible();

  await page.getByRole("link", { name: "Оформить заказ" }).click();
  await page.waitForURL("**/checkout");

  // ТЗ 1.1/5.5: checkout must not require an account -- a guest fills
  // contact fields directly, no login/register gate in between.
  await page.fill("#email", `e2e-${Date.now()}@example.com`);
  await page.fill("#phone", "+996700000000");
  await page.fill("#full_name", "E2E Buyer");
  await page.getByRole("button", { name: "Оплатить" }).click();

  await page.waitForURL("**/checkout/success/**", { timeout: 15000 });
  await expect(page.getByText(/Номер заказа: ORD-/)).toBeVisible();
});

test("a competing checkout draining stock disables checkout with a readable message", async ({
  page,
  request,
}) => {
  const { variant } = await findPurchasableVariant(page);
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

  // The cart page itself must not offer a live link into checkout for a cart
  // it already knows is unavailable -- only a disabled lookalike button.
  await page.goto("/cart");
  await expect(
    page.getByText("Некоторые товары недоступны в нужном количестве — уберите их")
  ).toBeVisible();
  await expect(page.getByRole("complementary").getByRole("button", { name: "Оформить заказ" })).toBeDisabled();
  await expect(page.getByRole("complementary").getByRole("link", { name: "Оформить заказ" })).toHaveCount(0);

  await page.goto("/checkout");
  await page.fill("#email", `e2e-conflict-${Date.now()}@example.com`);
  await page.fill("#phone", "+996700000002");
  await page.fill("#full_name", "E2E Buyer");

  // The competitor's purchase already happened before this page loaded, so
  // the fresh cart fetch here reflects it immediately -- checkout is blocked
  // up front with an explanation, not discovered via a 409 after submitting.
  await expect(
    page.getByText("Некоторые товары в корзине недоступны в нужном количестве")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Оплатить" })).toBeDisabled();
});
