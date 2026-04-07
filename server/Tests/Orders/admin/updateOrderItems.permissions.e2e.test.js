const request = require("supertest");

const app = require("../../testApp");

const Order = require("../../../models/order.model");
const Role = require("../../../models/role.model");

const { loginAsAdmin, loginAs } = require("../../helpers/loginAs");
const { createUser } = require("../../helpers/authTestData");
const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../helpers/orderFactory");

describe("PATCH /api/admin/orders/:orderId/items (Permissions)", () => {
  const getValidDeliveryAddress = () => ({
    line1: "10 Downing Street",
    line2: "",
    city: "London",
    postcode: "SW1A 2AA",
    country: "United Kingdom",
  });

  const getValidLocation = () => ({
    lat: 51.5033635,
    lng: -0.1276248,
  });

  test("allows non-admin users with orders.update to edit items", async () => {
    const adminCookie = await loginAsAdmin(app);

    // A normal role with explicit permissions.
    const role = await Role.create({
      name: `ops_${Date.now()}`,
      permissions: ["orders.read", "orders.update"],
      isSystem: false,
    });

    const opsUser = await createUser({
      role: role.name,
      status: "active",
      password: "secret123",
    });

    // Ensure user points to this role doc.
    opsUser.role = role._id;
    await opsUser.save();

    const opsCookie = await loginAs(app, opsUser);

    const customer = await createCustomer();
    const product = await createProduct();

    const variantA = await createVariant({ product, price: 5 });
    const variantB = await createVariant({ product, price: 3 });

    // Manual-imported order (editable)
    const order = await Order.create({
      customer: customer._id,
      items: [
        {
          product: product._id,
          variant: variantA._id,
          name: variantA.name,
          sku: variantA.sku,
          price: variantA.price,
          quantity: 1,
          subtotal: variantA.price,
        },
      ],
      subtotal: variantA.price,
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 1,
      total: variantA.price + 1,
      totalBeforeDiscount: variantA.price + 1,
      discountAmount: 0,
      isDiscounted: false,
      status: "paid",
      paidAt: new Date(),
      reservationExpiresAt: new Date(),
      metadata: { manualImport: true },
    });

    const res = await request(app)
      .patch(`/api/admin/orders/${order._id}/items`)
      .set("Cookie", opsCookie)
      .send({
        items: [
          { variantId: variantA._id.toString(), quantity: 2 },
          { variantId: variantB._id.toString(), quantity: 1 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBe(2);

    // subtotal = 2*5 + 1*3 = 13
    expect(res.body.data.subtotal).toBe(13);
    // deliveryFee = 1, total = 14
    expect(res.body.data.total).toBe(14);

    const fresh = await Order.findById(order._id);
    expect(fresh.items.length).toBe(2);
    expect(fresh.subtotal).toBe(13);
    expect(fresh.total).toBe(14);
    expect(fresh.metadata).toBeDefined();
    expect(fresh.metadata.itemsUpdatedAt).toBeDefined();
    expect(String(fresh.metadata.itemsUpdatedBy)).toBe(String(opsUser._id));

    // Admin can also edit (wildcard permission)
    const adminRes = await request(app)
      .patch(`/api/admin/orders/${order._id}/items`)
      .set("Cookie", adminCookie)
      .send({
        items: [{ variantId: variantA._id.toString(), quantity: 1 }],
      });

    expect(adminRes.status).toBe(200);
  });

  test("allows editing items for non-manual-import Stripe-backed orders", async () => {
    const adminCookie = await loginAsAdmin(app);

    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 5 });

    const order = await Order.create({
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
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 1,
      total: variant.price + 1,
      status: "paid",
      paidAt: new Date(),
      reservationExpiresAt: new Date(),
      // Not manual import:
      metadata: { manualImport: false },
      stripeCheckoutSessionId: "cs_test_123",
    });

    const res = await request(app)
      .patch(`/api/admin/orders/${order._id}/items`)
      .set("Cookie", adminCookie)
      .send({
        items: [{ variantId: variant._id.toString(), quantity: 2 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.subtotal).toBe(10);
    expect(res.body.data.total).toBe(11);
  });
});
