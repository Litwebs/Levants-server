const request = require("supertest");

jest.mock("../../Integration/Email.service", () =>
  jest.fn(async () => ({ success: true })),
);

const app = require("../testApp");
const Broadcast = require("../../models/broadcast.model");
const Customer = require("../../models/customer.model");
const Order = require("../../models/order.model");
const Product = require("../../models/product.model");
const ProductVariant = require("../../models/variant.model");
const Subscription = require("../../models/subscription.model");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("Broadcast audience filtering (E2E)", () => {
  async function login(role = "admin") {
    const user = await createUser({ role });
    const response = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });
    return getSetCookieHeader(response);
  }

  async function seedAudience() {
    const [account, guest, disabled] = await Customer.create([
      {
        email: "account@example.com",
        firstName: "Account",
        lastName: "Customer",
        isGuest: false,
        notificationPreferences: { promotions: true },
      },
      {
        email: "guest@example.com",
        firstName: "Guest",
        lastName: "Customer",
        isGuest: true,
        notificationPreferences: { promotions: false },
      },
      {
        email: "disabled@example.com",
        firstName: "Disabled",
        lastName: "Customer",
        isGuest: false,
        status: "disabled",
        notificationPreferences: { promotions: true },
      },
    ]);
    const product = await Product.create({
      name: "Two litre milk",
      slug: `broadcast-milk-${Date.now()}`,
      category: "milk",
      description: "Fresh milk",
      status: "active",
      thumbnailImage: "64f000000000000000000010",
    });
    const variant = await ProductVariant.create({
      product: product._id,
      name: "Two litre",
      sku: `BROADCAST-MILK-${Date.now()}`,
      price: 2.5,
      stockQuantity: 100,
      status: "active",
    });
    await Order.create({
      orderId: `ORD-BROADCAST-${Date.now()}`,
      customer: guest._id,
      items: [{
        product: product._id,
        variant: variant._id,
        name: product.name,
        sku: variant.sku,
        price: 2.5,
        quantity: 1,
        subtotal: 2.5,
      }],
      subtotal: 2.5,
      total: 2.5,
      status: "paid",
      deliveryStatus: "delivered",
      deliveryAddress: {
        line1: "1 Test Road",
        city: "Bradford",
        postcode: "BD1 1AA",
        country: "United Kingdom",
      },
      location: { lat: 53.8, lng: -1.75 },
      reservationExpiresAt: new Date(Date.now() + 60_000),
      orderType: "one_time",
    });
    await Subscription.create({
      customer: account._id,
      status: "active",
      frequency: "weekly",
      preferredDeliveryDay: 0,
      preferredDeliveryDays: [0, 3],
      nextDeliveryDate: new Date(Date.now() + 86_400_000),
      startDate: new Date(),
      deliveryAddress: {
        line1: "2 Test Road",
        city: "Bradford",
        postcode: "BD1 1AB",
        country: "United Kingdom",
      },
      items: [{
        product: product._id,
        variant: variant._id,
        name: product.name,
        sku: variant.sku,
        quantity: 1,
        unitPrice: 2.5,
      }],
    });
    return { account, guest, disabled, product, variant };
  }

  test("previews customer type and enforces marketing consent", async () => {
    const cookie = await login();
    await seedAudience();
    const response = await request(app)
      .post("/api/admin/broadcasts/audience-preview")
      .set("Cookie", cookie)
      .send({
        messageType: "marketing",
        audience: { customerTypes: ["account", "guest"] },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.totalRecipients).toBe(1);
    expect(response.body.data.breakdown).toMatchObject({
      accounts: 1,
      guests: 0,
      marketingOptIn: 1,
    });
    expect(response.body.data.sample[0].email).toBe("account@example.com");
  });

  test("combines order and product filters and excludes disabled customers", async () => {
    const cookie = await login();
    const { product } = await seedAudience();
    const response = await request(app)
      .post("/api/admin/broadcasts/audience-preview")
      .set("Cookie", cookie)
      .send({
        messageType: "operational",
        audience: {
          productIds: [String(product._id)],
          orderStatuses: ["paid"],
          deliveryStatuses: ["delivered"],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.totalRecipients).toBe(1);
    expect(response.body.data.sample[0].email).toBe("guest@example.com");
  });

  test("filters subscriptions by status, frequency, and delivery day", async () => {
    const cookie = await login();
    await seedAudience();
    const response = await request(app)
      .post("/api/admin/broadcasts/audience-preview")
      .set("Cookie", cookie)
      .send({
        audience: {
          hasSubscription: "yes",
          subscriptionStatuses: ["active"],
          subscriptionFrequencies: ["weekly"],
          deliveryDays: [3],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.totalRecipients).toBe(1);
    expect(response.body.data.sample[0].email).toBe("account@example.com");
  });

  test("requires broadcasts.send permission", async () => {
    const cookie = await login("staff");
    const broadcast = await Broadcast.create({
      title: "Delivery update",
      description: "A useful update",
    });
    const response = await request(app)
      .post(`/api/admin/broadcasts/${broadcast._id}/send`)
      .set("Cookie", cookie);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Insufficient permissions");
  });
});
