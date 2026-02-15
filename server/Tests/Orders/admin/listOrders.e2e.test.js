const request = require("supertest");
const app = require("../../testApp");

const Order = require("../../../models/order.model");
const Variant = require("../../../models/variant.model");

const { loginAsAdmin, loginAsUser } = require("../../helpers/loginAs");
const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../helpers/orderFactory");

describe("GET /api/admin/orders (Admin)", () => {
  test("returns all orders for admin", async () => {
    const adminCookie = await loginAsAdmin(app);

    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });

    await Order.create([
      {
        customer: customer._id,
        items: [
          {
            product: product._id,
            variant: variant._id,
            name: variant.name,
            sku: variant.sku,
            price: variant.price,
            quantity: 1,
            subtotal: variant.price,
          },
        ],
        subtotal: variant.price,
        deliveryFee: 0,
        total: variant.price,
        status: "paid",
        paidAt: new Date(),
        reservationExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      {
        customer: customer._id,
        items: [
          {
            product: product._id,
            variant: variant._id,
            name: variant.name,
            sku: variant.sku,
            price: variant.price,
            quantity: 2,
            subtotal: variant.price * 2,
          },
        ],
        subtotal: variant.price * 2,
        deliveryFee: 0,
        total: variant.price * 2,
        status: "refunded",
        paidAt: new Date(Date.now() - 60 * 60 * 1000),
        refund: { refundedAt: new Date() },
        reservationExpiresAt: new Date(),
      },
    ]);

    const res = await request(app)
      .get("/api/admin/orders")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.orders)).toBe(true);
    expect(res.body.data.orders.length).toBe(2);

    const [first] = res.body.data.orders;
    expect(first.customer).toBeDefined();
    expect(first.items.length).toBeGreaterThan(0);
    expect(first.status).toBeDefined();
  });

  test("returns empty array when no orders exist", async () => {
    const adminCookie = await loginAsAdmin(app);

    const res = await request(app)
      .get("/api/admin/orders")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orders).toEqual([]);
  });

  test("fails when not authenticated", async () => {
    const res = await request(app).get("/api/admin/orders");

    expect(res.status).toBe(401);
  });

  test("fails when authenticated but not admin", async () => {
    const userCookie = await loginAsUser(app);

    const res = await request(app)
      .get("/api/admin/orders")
      .set("Cookie", userCookie);

    expect(res.status).toBe(403);
  });
});
