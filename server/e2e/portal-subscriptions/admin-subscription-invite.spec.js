"use strict";

const { test, expect } = require("@playwright/test");

const ADMIN_ORIGIN = "http://127.0.0.1:4174";
const ADMIN_API = "http://localhost:5001/api";

const adminUser = {
  id: "admin-e2e",
  name: "Admin E2E",
  email: "admin-e2e@example.com",
  role: {
    _id: "role-admin-e2e",
    name: "admin",
    permissions: ["*"],
  },
  status: "active",
  twoFactorEnabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const products = [
  {
    _id: "product-juice",
    name: "Apple Juice",
    category: "Juices",
    status: "active",
    isSubscriptionEligible: true,
    variants: [
      {
        _id: "variant-juice",
        name: "Juice 1L",
        sku: "JUICE-1L",
        price: 2,
        status: "active",
        stockQuantity: 100,
        reservedQuantity: 0,
      },
    ],
  },
  {
    _id: "product-eggs",
    name: "Farm Eggs",
    category: "Eggs",
    status: "active",
    isSubscriptionEligible: true,
    variants: [
      {
        _id: "variant-eggs",
        name: "Eggs 6",
        sku: "EGGS-6",
        price: 5,
        status: "active",
        stockQuantity: 100,
        reservedQuantity: 0,
      },
    ],
  },
  {
    _id: "product-milk",
    name: "Whole Milk",
    category: "Milk Unhomogenised",
    status: "active",
    isSubscriptionEligible: true,
    variants: [
      {
        _id: "variant-milk",
        name: "Milk 1L",
        sku: "MILK-1L",
        price: 3,
        status: "active",
        stockQuantity: 100,
        reservedQuantity: 0,
      },
    ],
  },
];

function corsHeaders() {
  return {
    "access-control-allow-origin": ADMIN_ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "content-type": "application/json",
  };
}

async function mockAdminApi(page, onSetupLink) {
  await page.route(`${ADMIN_API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
      return;
    }

    if (pathname === "/api/auth/authenticated" && method === "GET") {
      await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: true,
          data: { authenticated: true, user: adminUser },
        }),
      });
      return;
    }

    if (pathname === "/api/admin/products" && method === "GET") {
      await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: true,
          data: { products },
          meta: { page: 1, pageSize: 100, total: products.length },
        }),
      });
      return;
    }

    if (pathname === "/api/admin/subscription-settings" && method === "GET") {
      await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: true,
          data: { settings: { deliveryDays: [2, 5] } },
        }),
      });
      return;
    }

    if (pathname === "/api/admin/subscriptions/setup-link" && method === "POST") {
      onSetupLink(JSON.parse(request.postData() || "{}"));
      await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: true,
          data: {
            onboardingLink:
              "https://example.test/portal/subscriptions/new?prepared=1",
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, data: {} }),
    });
  });
}

function productCard(page, productName) {
  return page
    .getByRole("heading", { name: productName, exact: true })
    .locator("xpath=ancestor::article[1]");
}

test("admin keeps independent per-day baskets, reviews exact totals, preserves storefront order, and submits deliveryDayPlans", async ({
  page,
}) => {
  let submittedPayload = null;
  await mockAdminApi(page, (payload) => {
    submittedPayload = payload;
  });

  await page.goto(`${ADMIN_ORIGIN}/subscriptions/new`);

  await expect(
    page.getByRole("heading", {
      name: "Prepare customer subscription",
      exact: true,
    }),
  ).toBeVisible();

  await page.getByLabel("First name").fill("Test");
  await page.getByLabel("Last name").fill("Customer");
  await page.getByLabel("Email address").fill("test.customer@example.com");
  await page.getByLabel("Address line 1").fill("1 Test Street");
  await page.getByLabel("Town or city").fill("Bradford");
  await page.getByLabel("Postcode").fill("BD1 1AA");

  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Delivery frequency", exact: true }),
  ).toBeVisible();

  await page
    .getByText("Fri", { exact: true })
    .locator("xpath=ancestor::button[1]")
    .click();

  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(
    page.getByRole("heading", {
      name: "Choose products for each delivery day",
      exact: true,
    }),
  ).toBeVisible();

  // API order is Juice, Eggs, Milk. The admin must mirror storefront category
  // order instead: Milk, Eggs, Juice.
  await expect(page.locator("article h3")).toHaveText([
    "Whole Milk",
    "Farm Eggs",
    "Apple Juice",
  ]);

  // Friday gets a completely separate basket.
  await productCard(page, "Apple Juice")
    .getByRole("button", { name: "Add Juice 1L", exact: true })
    .click();

  // Switch back to Tuesday and build a different order.
  await page
    .getByText("Tuesday", { exact: true })
    .locator("xpath=ancestor::button[1]")
    .click();

  const milkCard = productCard(page, "Whole Milk");
  await milkCard
    .getByRole("button", { name: "Add Milk 1L", exact: true })
    .click();
  await milkCard
    .getByRole("button", { name: "Add Milk 1L", exact: true })
    .click();
  await productCard(page, "Farm Eggs")
    .getByRole("button", { name: "Add Eggs 6", exact: true })
    .click();

  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Review subscription", exact: true }),
  ).toBeVisible();

  const review = page
    .getByRole("heading", {
      name: "Orders by delivery day",
      exact: true,
    })
    .locator("xpath=ancestor::section[1]");

  await expect(review).toContainText("£13.00 per cycle");

  const tuesdayPlan = review.getByTestId("review-day-2");
  const fridayPlan = review.getByTestId("review-day-5");

  // Each delivery day must be visually self-contained and show enough detail
  // for an admin to verify product, variant, SKU, quantity and price.
  await expect(tuesdayPlan).toContainText("Tuesday delivery");
  await expect(tuesdayPlan).toContainText("2 products · 3 items");
  await expect(tuesdayPlan).toContainText("£11.00");
  await expect(tuesdayPlan).toContainText("Whole Milk");
  await expect(tuesdayPlan).toContainText("Milk 1L");
  await expect(tuesdayPlan).toContainText("SKU MILK-1L");
  await expect(tuesdayPlan).toContainText("Unit price");
  await expect(tuesdayPlan).toContainText("£3.00");
  await expect(tuesdayPlan).toContainText("Qty");
  await expect(tuesdayPlan).toContainText("2");
  await expect(tuesdayPlan).toContainText("Line total");
  await expect(tuesdayPlan).toContainText("£6.00");
  await expect(tuesdayPlan).toContainText("Farm Eggs");
  await expect(tuesdayPlan).toContainText("Eggs 6");
  await expect(tuesdayPlan).toContainText("SKU EGGS-6");
  await expect(tuesdayPlan).toContainText("£5.00");

  await expect(fridayPlan).toContainText("Friday delivery");
  await expect(fridayPlan).toContainText("1 product · 1 item");
  await expect(fridayPlan).toContainText("Apple Juice");
  await expect(fridayPlan).toContainText("Juice 1L");
  await expect(fridayPlan).toContainText("SKU JUICE-1L");
  await expect(fridayPlan).toContainText("£2.00");

  // Products must not leak across day baskets.
  await expect(tuesdayPlan).not.toContainText("Apple Juice");
  await expect(fridayPlan).not.toContainText("Whole Milk");
  await expect(fridayPlan).not.toContainText("Farm Eggs");

  await page
    .getByRole("button", { name: "Create setup link", exact: true })
    .click();

  await expect(
    page.getByRole("heading", {
      name: "Subscription setup is ready",
      exact: true,
    }),
  ).toBeVisible();

  expect(submittedPayload).toBeTruthy();
  expect(submittedPayload.subscription.frequency).toBe("weekly");
  expect(submittedPayload.subscription.preferredDeliveryDays).toEqual([2, 5]);
  expect(submittedPayload.subscription.deliveryDayPlans).toEqual([
    {
      day: 2,
      items: [
        { variantId: "variant-milk", quantity: 2 },
        { variantId: "variant-eggs", quantity: 1 },
      ],
    },
    {
      day: 5,
      items: [{ variantId: "variant-juice", quantity: 1 }],
    },
  ]);

  expect(
    submittedPayload.subscription.items
      .slice()
      .sort((a, b) => a.variantId.localeCompare(b.variantId)),
  ).toEqual([
    { variantId: "variant-eggs", quantity: 1 },
    { variantId: "variant-juice", quantity: 1 },
    { variantId: "variant-milk", quantity: 2 },
  ]);
});
