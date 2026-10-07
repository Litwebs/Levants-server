const analyticsService = require("../../services/analytics.admin.service");
const {
  createProduct,
  createVariant,
} = require("../Orders/helpers/orderFactory");

describe("analytics dashboard stock snapshot", () => {
  test("summary counts and dashboard stock lists agree from the shared stock scan", async () => {
    const product = await createProduct();

    const low = await createVariant({ product, stock: 3, price: 5 });
    const out = await createVariant({ product, stock: 0, price: 5 });
    await createVariant({ product, stock: 20, price: 5 });

    const summary = await analyticsService.GetSummary({ range: "all" });
    const dashboard = await analyticsService.GetDashboard({
      range: "all",
      interval: "month",
    });

    expect(summary.data.lowStockItems).toBe(1);
    expect(summary.data.outOfStockItems).toBe(1);

    expect(dashboard.data.lowStock.items).toEqual([
      expect.objectContaining({
        _id: low._id,
        available: 3,
      }),
    ]);
    expect(dashboard.data.outOfStock.items).toEqual([
      expect.objectContaining({
        _id: out._id,
        available: 0,
      }),
    ]);
  });
});
