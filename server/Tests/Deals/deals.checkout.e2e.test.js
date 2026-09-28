const request = require("supertest");
const app = require("../testApp");
const stripe = require("../../utils/stripe.util");
const Deal = require("../../models/deal.model");
const Order = require("../../models/order.model");
const {
  listActiveDeals,
  validateDealsForOrder,
} = require("../../services/deals.public.service");
const {
  createCustomer,
  createProduct,
  createVariant,
} = require("../Orders/helpers/orderFactory");

const address = {
  line1: "10 Downing Street",
  line2: "",
  city: "London",
  postcode: "SW1A 2AA",
  country: "United Kingdom",
};

async function createDealFixture({
  variant,
  quantity = 2,
  packagePrice = 8,
  isActive = true,
  isFeatured = true,
  startsAt = null,
  endsAt = null,
} = {}) {
  return Deal.create({
    name: "Family Dairy Bundle",
    slug: "family-dairy-bundle-" + Date.now() + "-" + Math.floor(Math.random() * 10000),
    description: "A test bundle",
    items: [{ variant: variant._id, quantity }],
    packagePrice,
    currency: "GBP",
    isActive,
    isFeatured,
    startsAt,
    endsAt,
  });
}

describe("deals and product packages", () => {
  test("public deals calculate live value, saving and stock availability", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 5 });
    await createDealFixture({ variant, quantity: 2, packagePrice: 8 });

    const result = await listActiveDeals({ page: 1, pageSize: 10 });

    expect(result.success).toBe(true);
    expect(result.data.deals).toHaveLength(1);
    expect(result.data.deals[0]).toMatchObject({
      packagePrice: 8,
      originalValue: 10,
      savings: 2,
      savingsPercent: 20,
      maxPackages: 5,
    });
    expect(result.data.deals[0].items[0]).toMatchObject({
      variantId: String(variant._id),
      quantity: 2,
    });
  });

  test("out-of-stock packages are not exposed by the public deals API", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 1, price: 5 });
    await createDealFixture({ variant, quantity: 2, packagePrice: 8 });

    const result = await listActiveDeals({ page: 1, pageSize: 10 });

    expect(result.success).toBe(true);
    expect(result.data.deals).toHaveLength(0);
  });

  test("deal validation rejects tampered component quantities", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const deal = await createDealFixture({
      variant,
      quantity: 2,
      packagePrice: 8,
    });

    const result = await validateDealsForOrder({
      dealClaims: [{ dealId: String(deal._id), quantity: 2, expectedPackagePrice: 8 }],
      resolvedItems: [
        {
          product: product._id,
          variant: variant._id,
          price: 5,
          quantity: 3,
          subtotal: 15,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("Deal contents do not match the order");
  });

  test("checkout prices the package on the server while reserving its real components", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 5 });
    const deal = await createDealFixture({
      variant,
      quantity: 2,
      packagePrice: 8,
    });

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: String(customer._id),
        items: [{ variantId: String(variant._id), quantity: 2 }],
        deals: [{ dealId: String(deal._id), quantity: 1, expectedPackagePrice: 8 }],
        deliveryAddress: address,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const order = await Order.findById(res.body.data.orderId).lean();
    expect(order.subtotal).toBe(10);
    expect(order.deliveryFee).toBe(1);
    expect(order.discountAmount).toBe(2);
    expect(order.total).toBe(9);
    expect(order.metadata.dealDiscountAmount).toBe(2);
    expect(order.metadata.deals).toHaveLength(1);
    expect(order.metadata.deals[0]).toMatchObject({
      dealId: String(deal._id),
      quantity: 1,
      packagePrice: 8,
      originalValue: 10,
      saving: 2,
    });

    const checkoutArgs = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(checkoutArgs.line_items[0].quantity).toBe(2);
    expect(checkoutArgs.line_items[0].price_data.unit_amount).toBe(500);
    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_off: 200,
        currency: "gbp",
        duration: "once",
        name: "Deal package saving",
      }),
    );
    expect(checkoutArgs.discounts).toEqual([{ coupon: "coupon_test_123" }]);
  });

  test("checkout refuses a deal combined with a discount code", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 5 });
    const deal = await createDealFixture({
      variant,
      quantity: 2,
      packagePrice: 8,
    });

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: String(customer._id),
        items: [{ variantId: String(variant._id), quantity: 2 }],
        deals: [{ dealId: String(deal._id), quantity: 1, expectedPackagePrice: 8 }],
        discountCode: "SAVE10",
        deliveryAddress: address,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/can't be combined/i);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
