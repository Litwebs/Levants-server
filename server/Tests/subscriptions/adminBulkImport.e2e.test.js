const request = require("supertest");

jest.mock("../../Integration/Email.service", () =>
  jest.fn(async () => ({ success: true })),
);

const app = require("../testApp");
const Customer = require("../../models/customer.model");
const Product = require("../../models/product.model");
const ProductVariant = require("../../models/variant.model");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("Admin bulk subscription setup import (E2E)", () => {
  async function login(role = "admin") {
    const user = await createUser({ role });
    const response = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });
    return getSetCookieHeader(response);
  }

  async function createEligibleVariant() {
    const product = await Product.create({
      name: "Two litre milk",
      slug: `two-litre-milk-${Date.now()}`,
      category: "milk",
      description: "Fresh milk",
      status: "active",
      isSubscriptionEligible: true,
      thumbnailImage: "64f000000000000000000010",
    });
    return ProductVariant.create({
      product: product._id,
      name: "Two litre milk",
      sku: `MILK-2L-${Date.now()}`,
      price: 2.5,
      stockQuantity: 100,
      status: "active",
    });
  }

  const buildRow = (variantId, overrides = {}) => ({
    rowNumber: 2,
    firstName: "Rebecca",
    lastName: "Davey",
    email: "rebecca@example.com",
    phone: "07400123456",
    address: {
      line1: "21 Andover Green",
      city: "Bradford",
      postcode: "BD4 9HG",
      country: "United Kingdom",
      isDefault: true,
    },
    subscription: {
      frequency: "weekly",
      preferredDeliveryDay: 0,
      preferredDeliveryDays: [0, 3],
      items: [{ variantId: String(variantId), quantity: 2 }],
    },
    ...overrides,
  });

  test("creates a pending setup for every valid row", async () => {
    const cookie = await login("admin");
    const variant = await createEligibleVariant();

    const response = await request(app)
      .post("/api/admin/subscriptions/bulk-setup-links")
      .set("Cookie", cookie)
      .send({ rows: [buildRow(variant._id)] });

    expect(response.status).toBe(200);
    expect(response.body.data.summary).toEqual({
      total: 1,
      created: 1,
      failed: 0,
    });
    expect(response.body.data.results[0]).toMatchObject({
      rowNumber: 2,
      email: "rebecca@example.com",
      status: "created",
    });

    const customer = await Customer.findOne({ email: "rebecca@example.com" });
    expect(customer).toBeTruthy();
    expect(customer.pendingSubscriptionDraft).toMatchObject({
      frequency: "weekly",
      deliveryDays: ["Sunday", "Wednesday"],
      preparedByAdmin: true,
    });
    expect(
      customer.pendingSubscriptionDraft.quantities[String(variant._id)],
    ).toBe(2);

    const detailResponse = await request(app)
      .get(`/api/admin/subscriptions/pending:${customer._id}`)
      .set("Cookie", cookie);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.subscription).toMatchObject({
      _id: `pending:${customer._id}`,
      subscriptionNumber: "Pending setup",
      status: "pending",
      isPendingSetup: true,
      preferredDeliveryDays: [0, 3],
      customer: {
        email: "rebecca@example.com",
      },
    });
    expect(detailResponse.body.data.subscription.items[0]).toMatchObject({
      variant: String(variant._id),
      sku: variant.sku,
      quantity: 2,
    });
    expect(detailResponse.body.data.subscription.deliveryDayPlans).toEqual([
      {
        day: 0,
        items: [
          expect.objectContaining({
            variant: String(variant._id),
            sku: variant.sku,
            quantity: 2,
          }),
        ],
      },
      {
        day: 3,
        items: [
          expect.objectContaining({
            variant: String(variant._id),
            sku: variant.sku,
            quantity: 2,
          }),
        ],
      },
    ]);
  });

  test("deletes a pending setup and invalidates its invite without deleting the customer", async () => {
    const cookie = await login("admin");
    const variant = await createEligibleVariant();

    await request(app)
      .post("/api/admin/subscriptions/bulk-setup-links")
      .set("Cookie", cookie)
      .send({ rows: [buildRow(variant._id)] })
      .expect(200);

    const customer = await Customer.findOne({ email: "rebecca@example.com" });
    expect(customer).toBeTruthy();

    const response = await request(app)
      .delete(`/api/admin/subscriptions/pending:${customer._id}/pending-setup`)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Pending subscription setup deleted");
    expect(response.body.data.customer).toMatchObject({
      _id: String(customer._id),
      email: "rebecca@example.com",
    });

    const preservedCustomer = await Customer.findById(customer._id).select(
      "+portalInviteTokenHash",
    );
    expect(preservedCustomer).toBeTruthy();
    expect(preservedCustomer.pendingSubscriptionDraft).toBeNull();
    expect(preservedCustomer.portalInviteTokenHash).toBeNull();
    expect(preservedCustomer.portalInviteTokenExpiresAt).toBeNull();

    await request(app)
      .get(`/api/admin/subscriptions/pending:${customer._id}`)
      .set("Cookie", cookie)
      .expect(404);
  });

  test("requires subscription update permission to delete a pending setup", async () => {
    const customer = await Customer.create({
      firstName: "Pending",
      lastName: "Customer",
      email: "pending-delete@example.com",
      isGuest: true,
      pendingSubscriptionDraft: {
        frequency: "weekly",
        deliveryDays: ["Sunday"],
        quantities: {},
      },
    });
    const cookie = await login("pending-setup-viewer");

    const response = await request(app)
      .delete(`/api/admin/subscriptions/pending:${customer._id}/pending-setup`)
      .set("Cookie", cookie);

    expect(response.status).toBe(403);
    const unchangedCustomer = await Customer.findById(customer._id);
    expect(unchangedCustomer.pendingSubscriptionDraft).not.toBeNull();
  });

  test("reports duplicate emails without overwriting the first setup", async () => {
    const cookie = await login("admin");
    const variant = await createEligibleVariant();
    const first = buildRow(variant._id);
    const duplicate = buildRow(variant._id, { rowNumber: 3 });

    const response = await request(app)
      .post("/api/admin/subscriptions/bulk-setup-links")
      .set("Cookie", cookie)
      .send({ rows: [first, duplicate] });

    expect(response.status).toBe(200);
    expect(response.body.data.summary).toEqual({
      total: 2,
      created: 1,
      failed: 1,
    });
    expect(response.body.data.results[1]).toMatchObject({
      rowNumber: 3,
      status: "failed",
      message: "Duplicate email in this CSV",
    });
  });

  test("requires the dedicated subscription import permission", async () => {
    const cookie = await login("staff");
    const variant = await createEligibleVariant();

    const response = await request(app)
      .post("/api/admin/subscriptions/bulk-setup-links")
      .set("Cookie", cookie)
      .send({ rows: [buildRow(variant._id)] });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Insufficient permissions");
  });
});
