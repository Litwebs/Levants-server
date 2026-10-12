const { randomUUID } = require("crypto");
const Deal = require("../../../models/deal.model");
const { createProduct, createVariant } = require("../../Orders/helpers/orderFactory");

async function createPackage(overrides = {}) {
  const milk = await createProduct({ name: "Milk", slug: `milk-${randomUUID()}` });
  const eggs = await createProduct({ name: "Eggs", slug: `eggs-${randomUUID()}` });
  const milkVariant = await createVariant({ product: milk, stock: 20, price: 3.25 });
  const eggsVariant = await createVariant({ product: eggs, stock: 9, price: 2.75 });
  const deal = await Deal.create({
    name: "Breakfast package", slug: `breakfast-${randomUUID()}`,
    items: [{ variant: milkVariant._id, quantity: 2 }, { variant: eggsVariant._id, quantity: 3 }],
    packagePrice: 11.5, ...overrides,
  });
  const contents = deal.items.map(item => ({ variantId: String(item.variant), quantity: item.quantity }));
  const claim = { dealId: String(deal._id), quantity: 1, expectedPackagePrice: deal.packagePrice, expectedContents: contents };
  const resolvedItems = [milkVariant, eggsVariant].map(variant => ({
    product: variant.product, variant: variant._id, price: variant.price,
    quantity: contents.find(item => item.variantId === String(variant._id)).quantity,
  }));
  return { deal, milk, eggs, milkVariant, eggsVariant, contents, claim, resolvedItems };
}

module.exports = { createPackage };
