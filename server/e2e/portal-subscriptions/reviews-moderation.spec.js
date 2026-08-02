"use strict";

const { test, expect } = require("@playwright/test");
const {
  API_ORIGIN,
  approveReview,
  createFixture,
  getState,
  reset,
} = require("../support/e2e-client");

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test.afterAll(async ({ request }) => {
  await reset(request);
});

test("a submitted review remains pending until administrator approval", async ({
  page,
  request,
}) => {
  const fixture = await createFixture(request, {
    cadence: "weekly-single-day",
    timing: "before-cutoff",
    funds: "sufficient",
  });
  const state = await getState(request, fixture.subscriptionId);
  const orderId = state.orders[0]?.orderId;
  expect(orderId).toMatch(/^ORD-/);

  await page.goto(`/reviews?orderId=${encodeURIComponent(orderId)}`);
  await expect(page.getByLabel("Your Name")).toBeVisible();
  await page.getByLabel("Your Name").fill("Sarah M.");
  await page.getByRole("button", { name: "Rate 5 stars" }).click();
  await page
    .getByLabel("Review")
    .fill("Excellent quality and a dependable delivery service.");
  await page.getByRole("button", { name: "Submit Review" }).click();

  await expect(page.getByText("Thank You!")).toBeVisible();
  await expect(page.getByText(/awaiting approval/i)).toBeVisible();

  const pendingPublicResponse = await request.get(
    `${API_ORIGIN}/api/reviews?page=1&pageSize=20`,
  );
  expect(pendingPublicResponse.ok()).toBe(true);
  const pendingPublic = await pendingPublicResponse.json();
  expect(pendingPublic.data.reviews).toHaveLength(0);
  expect(pendingPublic.meta.total).toBe(0);
  expect(pendingPublic.meta.averageRating).toBeNull();

  const duplicateResponse = await request.get(
    `${API_ORIGIN}/api/reviews/verify/${encodeURIComponent(orderId)}`,
  );
  expect(duplicateResponse.status()).toBe(409);

  const approved = await approveReview(request, orderId);
  expect(approved.review.isVisible).toBe(true);

  const approvedPublicResponse = await request.get(
    `${API_ORIGIN}/api/reviews?page=1&pageSize=20`,
  );
  const approvedPublic = await approvedPublicResponse.json();
  expect(approvedPublic.data.reviews).toHaveLength(1);
  expect(approvedPublic.data.reviews[0]).toMatchObject({
    orderId,
    customerName: "Sarah M.",
    rating: 5,
    isVisible: true,
  });
  expect(approvedPublic.meta).toMatchObject({ total: 1, averageRating: 5 });

  await page.goto("/reviews");
  await expect(page.getByText("Sarah M.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Excellent quality and a dependable delivery service."),
  ).toBeVisible();
});
