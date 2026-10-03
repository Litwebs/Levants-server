const mongoose = require("mongoose");
const analyticsService = require("../../services/analytics.admin.service");
const { createCustomer, createProduct, createVariant, createOrder } = require("../Orders/helpers/orderFactory");

describe("analytics recurring vs one-time", () => {
  test("compares website one-time and subscription while excluding imported/manual", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 10, stock: 100 });
    const item = { product: product._id, variant: variant._id, name: variant.name, sku: variant.sku, price: 10, quantity: 1, subtotal: 10 };
    const paidAt = new Date("2026-06-11T12:00:00.000Z");

    await createOrder({ customer, status:"paid", items:[item], overrides:{ subtotal:100,total:100,paidAt }});
    await createOrder({ customer, status:"paid", items:[item], overrides:{ subtotal:50,total:50,paidAt,orderType:"subscription_generated",subscription:new mongoose.Types.ObjectId() }});
    await createOrder({ customer, status:"paid", items:[item], overrides:{ subtotal:25,total:25,paidAt,metadata:{manualImport:true},orderType:"subscription_generated",subscription:new mongoose.Types.ObjectId() }});

    const result = await analyticsService.GetRecurringVsOneTime({
      from:"2026-06-10", to:"2026-06-12", timeZone:"Europe/London",
    });

    expect(result.success).toBe(true);
    expect(result.data.oneTime).toEqual(expect.objectContaining({
      netRevenue:100,totalOrders:1,netRevenueSharePercent:66.67,orderSharePercent:50,
    }));
    expect(result.data.subscription).toEqual(expect.objectContaining({
      netRevenue:50,totalOrders:1,netRevenueSharePercent:33.33,orderSharePercent:50,
    }));
    expect(result.data.importedExcluded).toEqual(expect.objectContaining({
      netRevenue:25,totalOrders:1,
    }));
    expect(result.data.comparedTotals).toEqual(expect.objectContaining({
      netRevenue:150,totalOrders:2,
    }));
  });
});
