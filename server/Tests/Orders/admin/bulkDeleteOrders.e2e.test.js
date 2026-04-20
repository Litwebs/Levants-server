const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../../testApp");

const Order = require("../../../models/order.model");
const DeliveryBatch = require("../../../models/deliveryBatch.model");
const Route = require("../../../models/route.model");
const Stop = require("../../../models/stop.model");
const DiscountRedemption = require("../../../models/discountRedemption.model");
const Variant = require("../../../models/variant.model");

const { loginAsAdmin } = require("../../helpers/loginAs");
const { createUser } = require("../../helpers/authTestData");
const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../helpers/orderFactory");

describe("DELETE /api/admin/orders/bulk", () => {
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

  test("soft deletes selected orders and cleans related delivery references", async () => {
    const adminCookie = await loginAsAdmin(app);

    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 5 });
    const driver = await createUser({ role: "admin", status: "active" });

    const commonOrderShape = {
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
      totalBeforeDiscount: variant.price + 1,
      discountAmount: 0,
      isDiscounted: false,
      status: "paid",
      paidAt: new Date(),
      reservationExpiresAt: new Date(),
    };

    const orderA = await Order.create(commonOrderShape);
    const orderB = await Order.create(commonOrderShape);

    const batch = await DeliveryBatch.create({
      deliveryDate: new Date(),
      status: "locked",
      orders: [orderA._id, orderB._id],
    });

    const route = await Route.create({
      batch: batch._id,
      driver: driver._id,
      totalStops: 2,
      status: "planned",
    });

    await Stop.create([
      { route: route._id, order: orderA._id, sequence: 1 },
      { route: route._id, order: orderB._id, sequence: 2 },
    ]);

    await DiscountRedemption.create({
      discount: new mongoose.Types.ObjectId(),
      customer: customer._id,
      order: orderA._id,
    });

    const res = await request(app)
      .delete("/api/admin/orders/bulk")
      .set("Cookie", adminCookie)
      .send({ orderIds: [orderA._id.toString(), orderB._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBe(2);

    const [
      freshA,
      freshB,
      freshBatch,
      freshStops,
      freshRoute,
      freshRedemption,
    ] = await Promise.all([
      Order.findById(orderA._id),
      Order.findById(orderB._id),
      DeliveryBatch.findById(batch._id),
      Stop.find({ route: route._id }),
      Route.findById(route._id),
      DiscountRedemption.findOne({ order: orderA._id }),
    ]);

    expect(freshA).toBeTruthy();
    expect(freshB).toBeTruthy();
    expect(freshA.archived).toBe(true);
    expect(freshB.archived).toBe(true);
    expect(freshA.archivedAt).toBeTruthy();
    expect(freshB.archivedAt).toBeTruthy();
    expect(freshBatch.orders).toHaveLength(0);
    expect(freshStops).toHaveLength(0);
    expect(freshRoute.totalStops).toBe(0);
    expect(freshRedemption).toBeNull();

    const listRes = await request(app)
      .get("/api/admin/orders")
      .set("Cookie", adminCookie);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.orders).toHaveLength(0);
  });

  test("releases reserved stock when pending orders are soft deleted", async () => {
    const adminCookie = await loginAsAdmin(app);

    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 5 });

    const pendingOrder = await Order.create({
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
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 1,
      total: variant.price * 2 + 1,
      totalBeforeDiscount: variant.price * 2 + 1,
      discountAmount: 0,
      isDiscounted: false,
      status: "pending",
      reservationExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await Variant.updateOne(
      { _id: variant._id },
      { $set: { reservedQuantity: 2 } },
    );

    const res = await request(app)
      .delete("/api/admin/orders/bulk")
      .set("Cookie", adminCookie)
      .send({ orderIds: [pendingOrder._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const [updatedOrder, updatedVariant] = await Promise.all([
      Order.findById(pendingOrder._id),
      Variant.findById(variant._id),
    ]);

    expect(updatedOrder.archived).toBe(true);
    expect(updatedVariant.reservedQuantity).toBe(0);
  });
});
