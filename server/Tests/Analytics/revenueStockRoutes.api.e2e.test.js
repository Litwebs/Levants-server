const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");
const {
  createProduct,
  createVariant,
} = require("../Orders/helpers/orderFactory");

describe("analytics revenue and stock route contracts", () => {
  const loginAdmin = async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });
    return getSetCookieHeader(login);
  };

  test("revenue route exposes bounded zero-filled series over HTTP", async () => {
    const cookie = await loginAdmin();

    const response = await request(app)
      .get(
        "/api/admin/analytics/revenue?range=custom&from=2026-06-10&to=2026-06-12&interval=day&orderSource=subscription",
      )
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        interval: "day",
        points: [
          expect.objectContaining({ label: "2026-06-10", grossRevenue: 0, refunds: 0, netRevenue: 0, orders: 0 }),
          expect.objectContaining({ label: "2026-06-11", grossRevenue: 0, refunds: 0, netRevenue: 0, orders: 0 }),
          expect.objectContaining({ label: "2026-06-12", grossRevenue: 0, refunds: 0, netRevenue: 0, orders: 0 }),
        ],
        totals: expect.objectContaining({
          grossRevenue: 0,
          refunds: 0,
          netRevenue: 0,
          orders: 0,
        }),
      }),
    );
  });

  test("low-stock route returns only currently low active variants and honors limit", async () => {
    const product = await createProduct();
    const low = await createVariant({ product, stock: 3, price: 5 });
    await createVariant({ product, stock: 20, price: 5 });

    const cookie = await loginAdmin();
    const response = await request(app)
      .get("/api/admin/analytics/low-stock?limit=1")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toEqual(
      expect.objectContaining({
        _id: String(low._id),
        available: 3,
      }),
    );
  });
});
