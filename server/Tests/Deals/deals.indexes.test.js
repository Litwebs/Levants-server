const Deal = require("../../models/deal.model");
const {
  createProduct,
  createVariant,
} = require("../Orders/helpers/orderFactory");

test("explicit deal index migration creates a fresh collection with automatic indexing disabled", async () => {
  const originalAutoIndex = Deal.schema.options.autoIndex;
  Deal.schema.options.autoIndex = false;
  try {
    await Deal.collection.drop();
    expect(
      await Deal.db.db.listCollections({ name: "deals" }).toArray(),
    ).toHaveLength(0);
    await Deal.createIndexes();
    const indexes = await Deal.collection.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { slug: 1 }, unique: true }),
        expect.objectContaining({
          key: { isActive: 1, isFeatured: -1, sortOrder: 1, createdAt: -1 },
        }),
      ]),
    );
    const product = await createProduct();
    const variant = await createVariant({ product, stock: 20, price: 5 });
    const body = {
      name: "Fresh milk",
      slug: "fresh-milk",
      items: [{ variant: variant._id, quantity: 2 }],
      packagePrice: 8,
    };
    const deal = await Deal.create(body);
    expect(deal.createdAt).toBeInstanceOf(Date);
    expect(deal.updatedAt).toBeInstanceOf(Date);
    await expect(Deal.create(body)).rejects.toMatchObject({ code: 11000 });
    // The same startup migration is safe to repeat.
    await Deal.createIndexes();
    expect(await Deal.countDocuments()).toBe(1);
  } finally {
    Deal.schema.options.autoIndex = originalAutoIndex;
  }
});
