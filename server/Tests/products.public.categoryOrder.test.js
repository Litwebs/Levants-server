const mongoose = require("mongoose");
const Product = require("../models/product.model");
const Variant = require("../models/variant.model");
const { listProducts } = require("../services/products.public.service");

describe("public product category ordering", () => {
  async function createProduct({ name, slug, category, sku, price }) {
    const product = await Product.create({
      name,
      slug,
      category,
      description: `${name} description`,
      status: "active",
      isSubscriptionEligible: true,
      thumbnailImage: new mongoose.Types.ObjectId(),
    });

    await Variant.create({
      product: product._id,
      name: "Standard",
      sku,
      price,
      stockQuantity: 100,
      status: "active",
    });

    return product;
  }

  test("category_order returns the storefront priority regardless of creation order", async () => {
    const suffix = Date.now();

    // Deliberately create these in the opposite of the storefront priority.
    await createProduct({
      name: "Test Apple Juice",
      slug: `test-apple-juice-${suffix}`,
      category: "Juices",
      sku: `JUICE-${suffix}`,
      price: 2,
    });
    await createProduct({
      name: "Test Farm Eggs",
      slug: `test-farm-eggs-${suffix}`,
      category: "Eggs",
      sku: `EGGS-${suffix}`,
      price: 5,
    });
    await createProduct({
      name: "Test Whole Milk",
      slug: `test-whole-milk-${suffix}`,
      category: "Milk Unhomogenised",
      sku: `MILK-${suffix}`,
      price: 3,
    });

    const result = await listProducts({
      page: 1,
      pageSize: 20,
      sort: "category_order",
    });

    expect(result.items.map((item) => item.name)).toEqual([
      "Test Whole Milk",
      "Test Farm Eggs",
      "Test Apple Juice",
    ]);
    expect(result.items.map((item) => item.category)).toEqual([
      "Milk Unhomogenised",
      "Eggs",
      "Juices",
    ]);
  });
});
