const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("analytics dashboard API contract", () => {
  const login = async (role) => {
    const user = await createUser({ role });
    const response = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });
    return getSetCookieHeader(response);
  };

  test("requires authentication and analytics.read permission", async () => {
    const unauthenticated = await request(app).get(
      "/api/admin/analytics/dashboard?range=today&interval=day",
    );
    expect(unauthenticated.status).toBe(401);

    const driverCookie = await login("driver");
    const forbidden = await request(app)
      .get("/api/admin/analytics/dashboard?range=today&interval=day")
      .set("Cookie", driverCookie);

    expect(forbidden.status).toBe(403);
  });

  test("returns the complete stable dashboard contract on an empty bounded period", async () => {
    const adminCookie = await login("admin");

    const response = await request(app)
      .get(
        "/api/admin/analytics/dashboard?range=custom&from=2026-06-10&to=2026-06-12&interval=day&comparison=previous_year",
      )
      .set("Cookie", adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const data = response.body.data;
    expect(data).toEqual(
      expect.objectContaining({
        overview: expect.any(Object),
        summary: expect.any(Object),
        revenue: expect.any(Object),
        salesTrends: expect.any(Object),
        revenueComposition: expect.any(Object),
        salesBreakdown: expect.any(Object),
        topProducts: expect.any(Object),
        productTrends: expect.any(Object),
        variantTrends: expect.any(Object),
        variantUnits: expect.any(Object),
        variantRevenue: expect.any(Object),
        variantRealisedPrice: expect.any(Object),
        variantPriceComparison: expect.any(Object),
        variantSalesMix: expect.any(Object),
        variantContribution: expect.any(Object),
        activeSubscriptions: expect.any(Object),
        averageSubscriptionValue: expect.any(Object),
        newSubscriptions: expect.any(Object),
        cancelledSubscriptions: expect.any(Object),
        subscriptionRevenue: expect.any(Object),
        recurringVsOneTime: expect.any(Object),
        subscriptionTrends: expect.any(Object),
        topSubscriptionProductsVariants: expect.any(Object),
        recentOrders: expect.any(Object),
        lowStock: expect.any(Object),
        outOfStock: expect.any(Object),
      }),
    );

    expect(data.overview.comparison).toEqual(
      expect.objectContaining({
        available: true,
        strategy: "previous_year",
      }),
    );

    expect(data.revenue).toEqual(
      expect.objectContaining({
        interval: "day",
        points: [
          expect.objectContaining({ label: "2026-06-10", netRevenue: 0, orders: 0 }),
          expect.objectContaining({ label: "2026-06-11", netRevenue: 0, orders: 0 }),
          expect.objectContaining({ label: "2026-06-12", netRevenue: 0, orders: 0 }),
        ],
      }),
    );

    expect(data.subscriptionTrends).toEqual(
      expect.objectContaining({
        interval: "day",
        points: [
          expect.objectContaining({
            label: "2026-06-10",
            newSubscriptions: 0,
            cancelledSubscriptions: 0,
            netRevenue: 0,
          }),
          expect.objectContaining({
            label: "2026-06-11",
            newSubscriptions: 0,
            cancelledSubscriptions: 0,
            netRevenue: 0,
          }),
          expect.objectContaining({
            label: "2026-06-12",
            newSubscriptions: 0,
            cancelledSubscriptions: 0,
            netRevenue: 0,
          }),
        ],
      }),
    );

    expect(data.topProducts.byRevenue).toEqual([]);
    expect(data.variantRevenue.byRevenue).toEqual([]);
    expect(data.recentOrders.orders).toEqual([]);
    expect(data.lowStock.items).toEqual([]);
    expect(data.outOfStock.items).toEqual([]);
  });

  test("dashboard supports disabling comparison without changing the metric payload", async () => {
    const adminCookie = await login("admin");

    const response = await request(app)
      .get(
        "/api/admin/analytics/dashboard?range=custom&from=2026-06-10&to=2026-06-12&interval=day&comparison=none",
      )
      .set("Cookie", adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.overview.comparison).toEqual(
      expect.objectContaining({
        available: false,
        reason: "comparison_disabled",
        strategy: "none",
      }),
    );
    expect(response.body.data.overview.metrics).toEqual(
      expect.objectContaining({
        netRevenue: 0,
        totalOrders: 0,
        unitsSold: 0,
      }),
    );
  });
});
