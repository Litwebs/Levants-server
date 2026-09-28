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

  test("checkout refuses a stale package price instead of silently charging a changed price", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 5 });
    const deal = await createDealFixture({
      variant,
      quantity: 2,
      packagePrice: 8,
    });

    deal.packagePrice = 7.5;
    await deal.save();

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: String(customer._id),
        items: [{ variantId: String(variant._id), quantity: 2 }],
        deals: [
          {
            dealId: String(deal._id),
            quantity: 1,
            expectedPackagePrice: 8,
          },
        ],
        deliveryAddress: address,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/price has changed/i);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
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

  test("deal validation rejects duplicate deal claims", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const deal = await createDealFixture({ variant, quantity: 2, packagePrice: 8 });

    const result = await validateDealsForOrder({
      dealClaims: [
        { dealId: String(deal._id), quantity: 1, expectedPackagePrice: 8 },
        { dealId: String(deal._id), quantity: 1, expectedPackagePrice: 8 },
      ],
      resolvedItems: [
        {
          product: product._id,
          variant: variant._id,
          price: 5,
          quantity: 4,
          subtotal: 20,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/duplicate deal selection/i);
  });

  test("deal validation rejects zero, fractional and malformed package quantities", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const deal = await createDealFixture({ variant, quantity: 2, packagePrice: 8 });
    const resolvedItems = [
      {
        product: product._id,
        variant: variant._id,
        price: 5,
        quantity: 2,
        subtotal: 10,
      },
    ];

    for (const quantity of [0, -1, 1.5, "abc"]) {
      const result = await validateDealsForOrder({
        dealClaims: [
          {
            dealId: String(deal._id),
            quantity,
            expectedPackagePrice: 8,
          },
        ],
        resolvedItems,
      });
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/invalid deal selection/i);
    }
  });

  test("checkout supports multiple copies of the same package", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const deal = await createDealFixture({ variant, quantity: 2, packagePrice: 8 });

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: String(customer._id),
        items: [{ variantId: String(variant._id), quantity: 4 }],
        deals: [{ dealId: String(deal._id), quantity: 2, expectedPackagePrice: 8 }],
        deliveryAddress: address,
      });

    expect(res.status).toBe(200);
    const order = await Order.findById(res.body.data.orderId).lean();
    expect(order.subtotal).toBe(20);
    expect(order.discountAmount).toBe(4);
    expect(order.total).toBe(17);
    expect(order.metadata.deals[0]).toMatchObject({
      dealId: String(deal._id),
      quantity: 2,
      packagePrice: 8,
      originalValue: 10,
      saving: 2,
    });
    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount_off: 400, name: "Deal package saving" }),
    );
  });

  test("checkout discounts only package components when the same variant also has a normal cart quantity", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const deal = await createDealFixture({ variant, quantity: 2, packagePrice: 8 });

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: String(customer._id),
        items: [{ variantId: String(variant._id), quantity: 3 }],
        deals: [{ dealId: String(deal._id), quantity: 1, expectedPackagePrice: 8 }],
        deliveryAddress: address,
      });

    expect(res.status).toBe(200);
    const order = await Order.findById(res.body.data.orderId).lean();
    expect(order.subtotal).toBe(15);
    expect(order.discountAmount).toBe(2);
    expect(order.total).toBe(14);
  });

  test("checkout rejects a package that becomes inactive after it was added to the cart", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const deal = await createDealFixture({ variant, quantity: 2, packagePrice: 8 });

    deal.isActive = false;
    await deal.save();

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: String(customer._id),
        items: [{ variantId: String(variant._id), quantity: 2 }],
        deals: [{ dealId: String(deal._id), quantity: 1, expectedPackagePrice: 8 }],
        deliveryAddress: address,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no longer available/i);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test("checkout rejects a package that expires after it was added to the cart", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const deal = await createDealFixture({
      variant,
      quantity: 2,
      packagePrice: 8,
      endsAt: new Date(Date.now() + 60_000),
    });

    deal.endsAt = new Date(Date.now() - 60_000);
    await deal.save();

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: String(customer._id),
        items: [{ variantId: String(variant._id), quantity: 2 }],
        deals: [{ dealId: String(deal._id), quantity: 1, expectedPackagePrice: 8 }],
        deliveryAddress: address,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no longer available/i);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test("checkout rejects a package when its parent product is archived after carting", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const deal = await createDealFixture({ variant, quantity: 2, packagePrice: 8 });

    product.status = "archived";
    await product.save();

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: String(customer._id),
        items: [{ variantId: String(variant._id), quantity: 2 }],
        deals: [{ dealId: String(deal._id), quantity: 1, expectedPackagePrice: 8 }],
        deliveryAddress: address,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/product in this deal is no longer available/i);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();

    const freshVariant = await require("../../models/variant.model")
      .findById(variant._id)
      .lean();
    expect(freshVariant.reservedQuantity).toBe(0);
  });

  test("checkout rejects a package when stock is consumed or reserved after carting", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 5 });
    const deal = await createDealFixture({ variant, quantity: 2, packagePrice: 8 });

    variant.reservedQuantity = 9;
    await variant.save();

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: String(customer._id),
        items: [{ variantId: String(variant._id), quantity: 2 }],
        deals: [{ dealId: String(deal._id), quantity: 1, expectedPackagePrice: 8 }],
        deliveryAddress: address,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not enough stock/i);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test("checkout combines package saving and partial store credit into one Stripe adjustment", async () => {
    const customer = await createCustomer();
    customer.creditBalance = 500;
    await customer.save();

    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const deal = await createDealFixture({ variant, quantity: 2, packagePrice: 8 });

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: String(customer._id),
        items: [{ variantId: String(variant._id), quantity: 2 }],
        deals: [{ dealId: String(deal._id), quantity: 1, expectedPackagePrice: 8 }],
        creditToApplyMinor: 200,
        deliveryAddress: address,
      });

    expect(res.status).toBe(200);
    const order = await Order.findById(res.body.data.orderId).lean();
    expect(order.discountAmount).toBe(2);
    expect(order.creditApplied).toBe(200);
    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_off: 400,
        currency: "gbp",
        duration: "once",
        name: "Deal saving + store credit",
      }),
    );
  });

  test("checkout can settle a package fully with store credit without creating Stripe Checkout", async () => {
    const customer = await createCustomer();
    customer.creditBalance = 900;
    await customer.save();

    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const deal = await createDealFixture({ variant, quantity: 2, packagePrice: 8 });

    const res = await request(app)
      .post("/api/orders")
      .send({
        customerId: String(customer._id),
        items: [{ variantId: String(variant._id), quantity: 2 }],
        deals: [{ dealId: String(deal._id), quantity: 1, expectedPackagePrice: 8 }],
        creditToApplyMinor: 900,
        deliveryAddress: address,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.paidWithCredit).toBe(true);
    expect(res.body.data.checkoutUrl).toBeNull();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();

    const order = await Order.findById(res.body.data.orderId).lean();
    expect(order.discountAmount).toBe(2);
    expect(order.creditApplied).toBe(900);
  });

});
