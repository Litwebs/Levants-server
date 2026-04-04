const request = require("supertest");

const app = require("../../testApp");

const ProductVariant = require("../../../models/variant.model");

const { loginAsAdmin } = require("../../helpers/loginAs");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../../Orders/helpers/orderFactory");

describe("POST /api/admin/delivery/orders/stock (E2E)", () => {
  test("aggregates stock from provided orderIds", async () => {
    const adminCookie = await loginAsAdmin(app);

    const customer = await createCustomer();

    const product = await createProduct();
    const variant = await createVariant({
      product,
      overrides: { sku: "SKU-A" },
    });

    const item1 = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      quantity: 2,
      subtotal: variant.price * 2,
    };

    const item2 = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      quantity: 3,
      subtotal: variant.price * 3,
    };

    const order1 = await createOrder({
      status: "paid",
      customer,
      items: [item1],
      overrides: { paidAt: new Date() },
    });

    const order2 = await createOrder({
      status: "paid",
      customer,
      items: [item2],
      overrides: { paidAt: new Date() },
    });

    const res = await request(app)
      .post(`/api/admin/delivery/orders/stock`)
      .set("Cookie", adminCookie)
      .send({ orderIds: [String(order1._id), String(order2._id)] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const items = res.body?.data?.items || [];
    expect(items.length).toBe(1);
    expect(items[0].sku).toBe(variant.sku);
    expect(items[0].totalQuantity).toBe(5);
  });

  test("aggregates stock from uploaded csv ordersFile", async () => {
    const adminCookie = await loginAsAdmin(app);

    const product = await createProduct();
    const variant = await createVariant({
      product,
      overrides: { sku: "SKU-CSV" },
    });

    // Ensure variant is active (some factories may create inactive variants)
    await ProductVariant.updateOne(
      { _id: variant._id },
      { $set: { status: "active" } },
    );

    const sku = String(variant.sku);
    const csv = `name,order\nAlice,2x ${sku}\nBob,${sku}\n`;

    const res = await request(app)
      .post(`/api/admin/delivery/orders/stock`)
      .set("Cookie", adminCookie)
      .attach("ordersFile", Buffer.from(csv, "utf8"), "orders.csv");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const items = res.body?.data?.items || [];
    expect(items.length).toBe(1);
    expect(items[0].sku).toBe(sku);
    expect(items[0].totalQuantity).toBe(3);

    const sources = res.body?.data?.sources;
    expect(sources?.sheet?.detectedType).toBe("csv");
  });
});
