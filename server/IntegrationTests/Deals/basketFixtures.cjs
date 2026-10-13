const { randomUUID } = require("node:crypto");
const Deal = require("../../models/deal.model");
const { createProduct, createVariant, createCustomer } = require("../../Tests/Orders/helpers/orderFactory");

async function createBasketFixture({ credit = 0 } = {}) {
  const products = {};
  const variants = {};
  for (const [name, price] of [["Milk", 5], ["Honey", 4], ["Juice", 3]]) {
    products[name] = await createProduct({ name, slug: `${name.toLowerCase()}-${randomUUID()}` });
    variants[name] = await createVariant({ product: products[name], stock: 100, price });
  }
  variants.OtherMilk = await createVariant({ product: products.Milk, stock: 100, price: 5 });
  const deals = {};
  deals.A = await Deal.create({ name: "Two milk", slug: `two-milk-${randomUUID()}`, items: [{ variant: variants.Milk.id, quantity: 2 }], packagePrice: 8 });
  deals.B = await Deal.create({ name: "Milk and honey", slug: `milk-honey-${randomUUID()}`, items: [{ variant: variants.Milk.id, quantity: 1 }, { variant: variants.Honey.id, quantity: 1 }], packagePrice: 6 });
  const customer = await createCustomer();
  customer.isGuest = false;
  customer.status = "active";
  customer.creditBalance = credit;
  customer.addresses = [{ line1: "1 Test Street", city: "Bradford", postcode: "BD1 1AA", country: "GB", isDefault: true }];
  await customer.save();
  const publicDeals = (await require("../../services/deals.public.service").listActiveDeals({ pageSize: 100 })).data.deals;
  return { products, variants, deals, customer, publicDeals };
}

function basketFor(fixture, quantities = {}, packages = {}) {
  return {
    items: Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([name, quantity]) => {
      const v = fixture.variants[name];
      const p = fixture.products[name === "OtherMilk" ? "Milk" : name];
      return { quantity, product: { id: p.id, name: p.name, category: "test", price: v.price, shortDescription: "", longDescription: "", images: ["https://cdn.test.com/milk.png"], badges: [], stockStatus: "in-stock" }, variant: { id: v.id, name, price: v.price, stockQuantity: v.stockQuantity, stockStatus: "in-stock" } };
    }),
    deals: Object.entries(packages).filter(([, quantity]) => quantity > 0).map(([key, quantity]) => ({ deal: fixture.publicDeals.find((deal) => deal.id === fixture.deals[key].id), quantity })),
  };
}

function expectedQuantities(fixture, quantities = {}, packages = {}) {
  const result = new Map();
  for (const [name, quantity] of Object.entries(quantities)) if (quantity > 0) result.set(fixture.variants[name].id, quantity);
  for (const [key, quantity] of Object.entries(packages)) for (const item of fixture.deals[key].items) {
    const id = String(item.variant);
    result.set(id, (result.get(id) || 0) + item.quantity * quantity);
  }
  return Object.fromEntries(result);
}

module.exports = { createBasketFixture, basketFor, expectedQuantities };
