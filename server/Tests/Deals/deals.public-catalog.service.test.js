require("./helpers/setup");
const Deal = require("../../models/deal.model");
const service = require("../../services/deals.public.service");
const { createPackage } = require("./helpers/dealFactory");

describe("Deals / public catalog", () => {
  test("mixed products use the limiting component after reservations and round savings to pennies", async () => {
    const { milkVariant, eggsVariant } = await createPackage();
    eggsVariant.reservedQuantity = 2;
    await eggsVariant.save();
    const result = await service.listActiveDeals();
    expect(result.data.deals[0]).toMatchObject({ originalValue: 14.75, packagePrice: 11.5, savings: 3.25, savingsPercent: 22, maxPackages: 2 });
    expect(result.data.deals[0].items.map(item => item.quantity)).toEqual([2, 3]);
    expect(result.data.deals[0].items[0].variantId).toBe(milkVariant.id);
  });

  test.each([0, 1, -1])("reservation-adjusted capacity never becomes negative (%s units)", async stock => {
    const { eggsVariant } = await createPackage();
    await eggsVariant.constructor.updateOne({ _id: eggsVariant.id }, { $set: { stockQuantity: Math.max(0, stock), reservedQuantity: stock === -1 ? 2 : 0 } });
    expect((await service.listActiveDeals()).data.deals[0].maxPackages).toBe(0);
  });

  test("schedule includes the exact start and excludes the exact end", async () => {
    const { deal } = await createPackage();
    const now = new Date("2030-05-01T12:00:00Z");
    await Deal.updateOne({ _id: deal.id }, { $set: { startsAt: now, endsAt: new Date(now.getTime() + 1000) } });
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
    try {
      jest.setSystemTime(now);
      expect((await service.getActiveDealBySlug({ slug: deal.slug })).success).toBe(true);
      jest.setSystemTime(new Date(now.getTime() + 1000));
      expect(await service.getActiveDealBySlug({ slug: deal.slug })).toMatchObject({ success: false, statusCode: 404 });
    } finally { jest.useRealTimers(); }
  });

  test.each(["inactive-variant", "deleted-variant", "deleted-product", "no-saving"])("%s is excluded before pagination totals are computed", async reason => {
    const { deal, eggsVariant, eggs } = await createPackage();
    await Deal.create({ name: "Valid milk offer", slug: "valid-milk", items: [{ variant: (await createPackage()).milkVariant._id, quantity: 1 }], packagePrice: 2 });
    // The second package is also valid and must remain discoverable.
    if (reason === "inactive-variant") { eggsVariant.status = "inactive"; await eggsVariant.save(); }
    if (reason === "deleted-variant") await eggsVariant.deleteOne();
    if (reason === "deleted-product") await eggs.deleteOne();
    if (reason === "no-saving") { eggsVariant.price = 0; await eggsVariant.save(); }
    const result = await service.listActiveDeals({ pageSize: 1 });
    expect(result.meta).toMatchObject({ total: 2, totalPages: 2 });
    expect(result.data.deals).toHaveLength(1);
    expect(await service.getActiveDealBySlug({ slug: deal.slug })).toMatchObject({ success: false, statusCode: 404 });
  });

  test("retail price changes update live savings without changing the fixed package price", async () => {
    const { deal, milkVariant } = await createPackage();
    milkVariant.price = 4;
    await milkVariant.save();
    const result = await service.getActiveDealBySlug({ slug: deal.slug });
    expect(result.data.deal).toMatchObject({ originalValue: 16.25, packagePrice: 11.5, savings: 4.75 });
  });

  test("image fallback prefers variant image then parent product image", async () => {
    const { deal, milkVariant, eggsVariant, milk } = await createPackage();
    const File = require("../../models/file.model");
    await File.findByIdAndUpdate(milkVariant.thumbnailImage, { url: "https://cdn.test.com/variant.jpg" });
    await File.findByIdAndUpdate(milk.thumbnailImage, { url: "https://cdn.test.com/product.jpg" });
    expect((await service.getActiveDealBySlug({ slug: deal.slug })).data.deal.imageUrl).toBe("https://cdn.test.com/variant.jpg");
    milkVariant.thumbnailImage = null; eggsVariant.thumbnailImage = null;
    await milkVariant.save(); await eggsVariant.save();
    const result = await service.getActiveDealBySlug({ slug: deal.slug });
    expect(result.data.deal.imageUrl).toBe("https://cdn.test.com/product.jpg");
    expect(result.data.deal.items[0].product.id).toBe(milk.id);
  });
});
