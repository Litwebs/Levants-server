const request = require("supertest");
const app = require("../testApp");
const Deal = require("../../models/deal.model");
const {
  archiveDeal,
  deactivateDeal,
  createDeal,
  updateDeal,
} = require("../../services/deals.admin.service");
const {
  validateDealsForOrder,
} = require("../../services/deals.public.service");
const {
  createProduct,
  createVariant,
} = require("../Orders/helpers/orderFactory");

async function createDealFixture({
  variant,
  name = "Family Dairy Bundle",
  slug,
  quantity = 2,
  packagePrice = 8,
  isActive = true,
  isFeatured = false,
  startsAt = null,
  endsAt = null,
  sortOrder = 0,
} = {}) {
  return Deal.create({
    name,
    slug:
      slug ||
      "family-dairy-bundle-" +
        Date.now() +
        "-" +
        Math.floor(Math.random() * 100000),
    description: "A test bundle",
    items: [{ variant: variant._id, quantity }],
    packagePrice,
    currency: "GBP",
    isActive,
    isFeatured,
    startsAt,
    endsAt,
    sortOrder,
  });
}

describe("deals admin and public lifecycle", () => {
  test.each([deactivateDeal, archiveDeal])(
    "conflicting lifecycle updates return a recoverable conflict",
    async (mutate) => {
      const product = await createProduct();
      const variant = await createVariant({ product, stock: 12, price: 5 });
      const deal = await createDealFixture({ variant });
      const stale = await Deal.findById(deal._id);
      await Deal.updateOne(
        { _id: deal._id },
        { $set: { name: "Concurrent edit" }, $inc: { __v: 1 } },
      );
      const lookup = jest.spyOn(Deal, "findById").mockResolvedValueOnce(stale);
      try {
        const result = await mutate({ dealId: String(deal._id) });
        expect(result).toMatchObject({ success: false, statusCode: 409 });
      } finally {
        lookup.mockRestore();
      }
      const saved = await Deal.findById(deal._id).lean();
      expect(saved.name).toBe("Concurrent edit");
      expect(saved.isActive).toBe(true);
      expect(saved.archivedAt).toBeNull();
    },
  );

  test("admin create calculates live value, saving and package availability", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 12, price: 5 });
    variant.reservedQuantity = 2;
    await variant.save();

    const result = await createDeal({
      body: {
        name: "Weekly Essentials",
        items: [{ variantId: String(variant._id), quantity: 2 }],
        packagePrice: 8,
      },
    });

    expect(result.success).toBe(true);
    expect(result.data.deal.slug).toBe("weekly-essentials");
    expect(result.data.deal.originalValue).toBe(10);
    expect(result.data.deal.savings).toBe(2);
    expect(result.data.deal.savingsPercent).toBe(20);
    expect(result.data.deal.maxPackages).toBe(5);
  });

  test("admin create rejects duplicate component variants", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });

    const result = await createDeal({
      body: {
        name: "Duplicate Components",
        items: [
          { variantId: String(variant._id), quantity: 1 },
          { variantId: String(variant._id), quantity: 2 },
        ],
        packagePrice: 10,
      },
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.message).toMatch(/only appear once/i);
  });

  test("admin create rejects a package price with no customer saving", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });

    const result = await createDeal({
      body: {
        name: "No Saving",
        items: [{ variantId: String(variant._id), quantity: 2 }],
        packagePrice: 10,
      },
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/lower than/i);
  });

  test("admin create rejects inactive variants", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    variant.status = "inactive";
    await variant.save();

    const result = await createDeal({
      body: {
        name: "Inactive Variant",
        items: [{ variantId: String(variant._id), quantity: 2 }],
        packagePrice: 8,
      },
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/unavailable/i);
  });

  test("admin create rejects variants belonging to inactive products", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    product.status = "archived";
    await product.save();

    const result = await createDeal({
      body: {
        name: "Inactive Product",
        items: [{ variantId: String(variant._id), quantity: 2 }],
        packagePrice: 8,
      },
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/products are unavailable/i);
  });

  test("admin create rejects invalid schedule windows", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const startsAt = new Date(Date.now() + 60_000);
    const endsAt = new Date(Date.now());

    const result = await createDeal({
      body: {
        name: "Bad Window",
        items: [{ variantId: String(variant._id), quantity: 2 }],
        packagePrice: 8,
        startsAt,
        endsAt,
      },
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/end date must be after/i);
  });

  test("admin prevents duplicate slugs on create and update", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const first = await createDealFixture({
      variant,
      slug: "existing-package",
    });
    const second = await createDealFixture({
      variant,
      slug: "second-package",
    });

    const createResult = await createDeal({
      body: {
        name: "Existing Package",
        slug: "existing-package",
        items: [{ variantId: String(variant._id), quantity: 1 }],
        packagePrice: 4,
      },
    });
    expect(createResult.success).toBe(false);
    expect(createResult.statusCode).toBe(409);

    const updateResult = await updateDeal({
      dealId: String(second._id),
      body: { slug: first.slug },
    });
    expect(updateResult.success).toBe(false);
    expect(updateResult.statusCode).toBe(409);
  });

  test("admin list honours featured filtering", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 30, price: 5 });

    await createDealFixture({
      variant,
      name: "Featured Admin",
      slug: "featured-admin",
      isFeatured: true,
    });
    await createDealFixture({
      variant,
      name: "Standard Admin",
      slug: "standard-admin",
      isFeatured: false,
    });

    const featured =
      await require("../../services/deals.admin.service").listDeals({
        page: 1,
        pageSize: 20,
        featured: true,
      });

    expect(featured.success).toBe(true);
    expect(featured.data.deals).toHaveLength(1);
    expect(featured.data.deals[0].slug).toBe("featured-admin");
    expect(featured.meta.total).toBe(1);

    const standard =
      await require("../../services/deals.admin.service").listDeals({
        page: 1,
        pageSize: 20,
        featured: false,
      });
    expect(standard.success).toBe(true);
    expect(standard.data.deals).toHaveLength(1);
    expect(standard.data.deals[0].slug).toBe("standard-admin");
    expect(standard.meta.total).toBe(1);
  });

  test("archive is terminal, idempotent, hidden publicly and rejected at checkout", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const deal = await createDealFixture({
      variant,
      name: "Archive Me",
      slug: "archive-me",
      isFeatured: true,
    });

    const archived = await archiveDeal({ dealId: String(deal._id) });
    expect(archived.success).toBe(true);
    expect(archived.data.deal.isActive).toBe(false);
    expect(archived.data.deal.isFeatured).toBe(false);
    expect(archived.data.deal.archivedAt).toBeTruthy();

    const firstArchivedAt = String(archived.data.deal.archivedAt);
    const repeated = await archiveDeal({ dealId: String(deal._id) });
    expect(repeated.success).toBe(true);
    expect(String(repeated.data.deal.archivedAt)).toBe(firstArchivedAt);

    const update = await updateDeal({
      dealId: String(deal._id),
      body: { isActive: true },
    });
    expect(update.success).toBe(false);
    expect(update.statusCode).toBe(409);

    const publicList = await request(app).get("/api/deals");
    expect(publicList.status).toBe(200);
    expect(publicList.body.data.deals).toHaveLength(0);

    const publicDetail = await request(app).get("/api/deals/archive-me");
    expect(publicDetail.status).toBe(404);

    const checkout = await validateDealsForOrder({
      dealClaims: [
        { dealId: String(deal._id), quantity: 1, expectedPackagePrice: 8 },
      ],
      resolvedItems: [
        {
          product: product._id,
          variant: variant._id,
          price: 5,
          quantity: 2,
          subtotal: 10,
        },
      ],
    });
    expect(checkout.success).toBe(false);
    expect(checkout.message).toMatch(/no longer available/i);

    const adminList =
      await require("../../services/deals.admin.service").listDeals({
        page: 1,
        pageSize: 20,
      });
    expect(
      adminList.data.deals.some((item) => item.slug === "archive-me"),
    ).toBe(true);
  });

  test("public list exposes only active, in-window, in-stock packages", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const now = Date.now();

    await createDealFixture({
      variant,
      name: "Visible",
      slug: "visible",
      startsAt: new Date(now - 60_000),
      endsAt: new Date(now + 60_000),
    });
    await createDealFixture({
      variant,
      name: "Future",
      slug: "future",
      startsAt: new Date(now + 60_000),
    });
    await createDealFixture({
      variant,
      name: "Expired",
      slug: "expired",
      endsAt: new Date(now - 60_000),
    });
    await createDealFixture({
      variant,
      name: "Inactive",
      slug: "inactive",
      isActive: false,
    });

    const outOfStockProduct = await createProduct();
    const outOfStockVariant = await createVariant({
      product: outOfStockProduct,
      stock: 1,
      price: 5,
    });
    await createDealFixture({
      variant: outOfStockVariant,
      name: "No Stock",
      slug: "no-stock",
      quantity: 2,
    });

    const res = await request(app).get("/api/deals");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deals.map((deal) => deal.slug)).toEqual(["visible"]);
    expect(res.body.meta.total).toBe(1);
  });

  test("public list honours featured filtering and sort order", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 50, price: 5 });

    await createDealFixture({
      variant,
      name: "Normal",
      slug: "normal",
      isFeatured: false,
      sortOrder: 0,
    });
    await createDealFixture({
      variant,
      name: "Featured Later",
      slug: "featured-later",
      isFeatured: true,
      sortOrder: 10,
    });
    await createDealFixture({
      variant,
      name: "Featured First",
      slug: "featured-first",
      isFeatured: true,
      sortOrder: 1,
    });

    const res = await request(app).get("/api/deals?featured=true");

    expect(res.status).toBe(200);
    expect(res.body.data.deals.map((deal) => deal.slug)).toEqual([
      "featured-first",
      "featured-later",
    ]);
    expect(res.body.meta.total).toBe(2);
  });

  test("public list paginates filtered deals and caps invalid page size", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 100, price: 5 });

    for (let index = 1; index <= 3; index += 1) {
      await createDealFixture({
        variant,
        name: "Package " + index,
        slug: "package-" + index,
        sortOrder: index,
      });
    }

    const pageTwo = await request(app).get("/api/deals?page=2&pageSize=2");
    expect(pageTwo.status).toBe(200);
    expect(pageTwo.body.data.deals).toHaveLength(1);
    expect(pageTwo.body.meta).toMatchObject({
      total: 3,
      page: 2,
      pageSize: 2,
      totalPages: 2,
    });

    const invalid = await request(app).get("/api/deals?pageSize=101");
    expect(invalid.status).toBe(400);
  });

  test("public detail returns 404 when a previously visible deal expires", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const deal = await createDealFixture({
      variant,
      slug: "temporary-package",
      endsAt: new Date(Date.now() + 60_000),
    });

    const visible = await request(app).get("/api/deals/temporary-package");
    expect(visible.status).toBe(200);

    deal.endsAt = new Date(Date.now() - 60_000);
    await deal.save();

    const expired = await request(app).get("/api/deals/temporary-package");
    expect(expired.status).toBe(404);
  });

  test("public availability uses stock minus existing reservations", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 10, price: 5 });
    variant.reservedQuantity = 4;
    await variant.save();
    await createDealFixture({
      variant,
      slug: "reserved-stock",
      quantity: 2,
    });

    const res = await request(app).get("/api/deals/reserved-stock");

    expect(res.status).toBe(200);
    expect(res.body.data.deal.maxPackages).toBe(3);
  });

  test("public API hides a deal when its parent product is archived", async () => {
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    await createDealFixture({ variant, slug: "archived-parent" });

    product.status = "archived";
    await product.save();

    const list = await request(app).get("/api/deals");
    expect(list.status).toBe(200);
    expect(list.body.data.deals).toHaveLength(0);

    const detail = await request(app).get("/api/deals/archived-parent");
    expect(detail.status).toBe(404);
  });
});
