const Order = require("../../../models/order.model");
const Variant = require("../../../models/variant.model");
const Customer = require("../../../models/customer.model");
const Product = require("../../../models/product.model");

async function createCustomer() {
  return Customer.create({
    firstName: "Test",
    lastName: "Customer",
    email: `customer-${Date.now()}@test.com`,
    phone: "07000000000",
    isGuest: true,
  });
}

async function createProduct(overrides = {}) {
  const now = Date.now();
  return Product.create({
    name: `Test Product ${now}`,
    slug: `test-product-${now}`,
    description: "Test product description",
    category: "test",
    status: "active",
    thumbnailImage: "img.jpg",
    ...overrides,
  });
}

async function createVariant({ product, stock = 10, price = 5 } = {}) {
  return Variant.create({
    product: product._id,
    name: "Test Variant",
    sku: `SKU-${Date.now()}`,
    price,
    stockQuantity: stock,
    reservedQuantity: 0,
    status: "active",
    thumbnailImage: "img.jpg",
  });
}

async function createOrder({
  status = "pending",
  items,
  customer,
  overrides = {},
}) {
  return Order.create({
    customer: customer._id,
    items,
    subtotal: 10,
    deliveryFee: 0,
    total: 10,
    status,
    reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    ...overrides,
  });
}

module.exports = {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
};
