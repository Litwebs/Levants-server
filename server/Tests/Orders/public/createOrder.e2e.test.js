const request = require("supertest");
const app = require("../../testApp");

const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../helpers/orderFactory");

describe("POST /api/orders (Public)", () => {
  test("creates order and reserves stock (happy path)", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10 });

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: customer._id.toString(),
        items: [
          {
            variantId: variant._id.toString(),
            quantity: 2,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.checkoutUrl).toBeDefined();
    expect(res.body.data.orderId).toBeDefined();

    const updatedVariant = await variant.constructor.findById(variant._id);
    expect(updatedVariant.reservedQuantity).toBe(2);
    expect(updatedVariant.stockQuantity).toBe(10);
  });

  test("fails when customerId is missing", async () => {
    const res = await request(app).post("/api/orders").send({
      items: [],
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/customer/i);
  });

  test("fails when items array is empty", async () => {
    const customer = await createCustomer();

    const res = await request(app).post("/api/orders").send({
      customerId: customer._id.toString(),
      items: [],
    });

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/items/i);
  });

  test("fails when variant does not exist", async () => {
    const customer = await createCustomer();

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: customer._id.toString(),
        items: [
          {
            variantId: "64b000000000000000000000",
            quantity: 1,
          },
        ],
      });

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/stock|variant/i);
  });

  test("fails when stock is insufficient", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 1 });

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: customer._id.toString(),
        items: [
          {
            variantId: variant._id.toString(),
            quantity: 5,
          },
        ],
      });

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/stock/i);

    const unchangedVariant = await variant.constructor.findById(variant._id);
    expect(unchangedVariant.reservedQuantity).toBe(0);
  });

  test("fails when quantity is invalid", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: customer._id.toString(),
        items: [
          {
            variantId: variant._id.toString(),
            quantity: 0,
          },
        ],
      });

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/quantity/i);
  });
});
