const mongoose = require("mongoose");
const Deal = require("../../models/deal.model");
const service = require("../../services/deals.admin.service");
const { createPackage } = require("./helpers/dealFactory");

describe("Deals / admin management", () => {
  test("editing contents recalculates price, savings and the limiting component stock", async () => {
    const { deal, milkVariant, eggsVariant } = await createPackage();
    eggsVariant.reservedQuantity = 2;
    await eggsVariant.save();
    const result = await service.updateDeal({ dealId: deal.id, body: {
      name: "Weekend breakfast", description: "Milk and eggs", isFeatured: true,
      packagePrice: 12, items: [{ variantId: milkVariant.id, quantity: 3 }, { variantId: eggsVariant.id, quantity: 2 }],
    } });
    expect(result.data.deal).toMatchObject({ name: "Weekend breakfast", description: "Milk and eggs", originalValue: 15.25, savings: 3.25, maxPackages: 3, isFeatured: true });
    expect((await Deal.findById(deal.id)).items.map(item => item.quantity)).toEqual([3, 2]);
  });

  test("deactivation can be reversed without changing package contents or price", async () => {
    const { deal } = await createPackage();
    expect((await service.deactivateDeal({ dealId: deal.id })).data.deal.isActive).toBe(false);
    const result = await service.updateDeal({ dealId: deal.id, body: { isActive: true } });
    expect(result.data.deal).toMatchObject({ isActive: true, packagePrice: 11.5 });
    expect(result.data.deal.items.map(item => item.quantity)).toEqual([2, 3]);
  });

  test("partial edits preserve omitted fields and allow clearing promotional dates", async () => {
    const { deal } = await createPackage({ description: "Keep me", startsAt: new Date("2030-01-01"), endsAt: new Date("2030-02-01") });
    const result = await service.updateDeal({ dealId: deal.id, body: { startsAt: null, endsAt: null } });
    expect(result.data.deal).toMatchObject({ description: "Keep me", startsAt: null, endsAt: null, packagePrice: 11.5 });
  });

  test("invalid partial schedule changes leave the persisted deal unchanged", async () => {
    const { deal } = await createPackage({ startsAt: new Date("2030-01-01"), endsAt: new Date("2030-02-01") });
    const result = await service.updateDeal({ dealId: deal.id, body: { startsAt: "2030-03-01" } });
    expect(result).toMatchObject({ success: false, statusCode: 400 });
    expect((await Deal.findById(deal.id)).startsAt.toISOString()).toBe("2030-01-01T00:00:00.000Z");
  });

  test.each(["getDeal", "updateDeal", "deactivateDeal", "archiveDeal"])("%s returns 404 for a missing deal", async method => {
    expect(await service[method]({ dealId: new mongoose.Types.ObjectId().toString(), body: { name: "Missing" } })).toMatchObject({ success: false, statusCode: 404 });
  });

  test.each(["active", "inactive", "featured", "archived"])("list status %s returns matching records and accurate totals", async status => {
    const { deal } = await createPackage();
    const base = { items: deal.items.toObject(), packagePrice: deal.packagePrice };
    await Deal.create([
      { ...base, name: "Inactive", slug: "inactive", isActive: false },
      { ...base, name: "Featured", slug: "featured", isFeatured: true },
      { ...base, name: "Archived", slug: "archived", archivedAt: new Date(), isActive: false },
    ]);
    const result = await service.listDeals({ status });
    expect(result.meta.total).toBe(status === "active" ? 2 : 1);
    for (const item of result.data.deals) {
      if (status === "archived") expect(item.archivedAt).toBeTruthy();
      else expect(item.archivedAt).toBeNull();
      if (status === "active") expect(item.isActive).toBe(true);
      if (status === "inactive") expect(item.isActive).toBe(false);
      if (status === "featured") expect(item.isFeatured).toBe(true);
    }
  });

  test("search escapes regex characters, supports slug search and ignores case", async () => {
    const { deal } = await createPackage({ name: "Milk (family)" });
    expect((await service.listDeals({ search: "(FAMILY)" })).meta.total).toBe(1);
    expect((await service.listDeals({ search: ".*" })).meta.total).toBe(0);
    expect((await service.listDeals({ search: deal.slug })).meta.total).toBe(1);
  });

  test.each([["name", ["Alpha", "Zulu"]], ["price-low", ["Zulu", "Alpha"]], ["price-high", ["Alpha", "Zulu"]]])("sorting %s stays consistent across pages", async (sort, expected) => {
    const { deal } = await createPackage({ name: "Zulu", packagePrice: 8 });
    await Deal.create({ name: "Alpha", slug: "alpha", items: deal.items.toObject(), packagePrice: 10 });
    const first = await service.listDeals({ sort, pageSize: 1, page: 1 });
    const second = await service.listDeals({ sort, pageSize: 1, page: 2 });
    expect([first.data.deals[0].name, second.data.deals[0].name]).toEqual(expected);
    expect(first.meta).toMatchObject({ total: 2, totalPages: 2, pageSize: 1 });
  });

  test("admin retains an unavailable deal for diagnosis when a component is deleted", async () => {
    const { deal, eggsVariant } = await createPackage();
    await eggsVariant.deleteOne();
    const result = await service.getDeal({ dealId: deal.id });
    expect(result.success).toBe(true);
    expect(result.data.deal).toMatchObject({ originalValue: 0, maxPackages: 0 });
    expect(result.data.deal.items).toHaveLength(2);
  });
});
