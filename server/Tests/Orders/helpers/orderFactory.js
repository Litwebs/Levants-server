const mongoose = require("mongoose");
const Order = require("../../../models/order.model");
const Variant = require("../../../models/variant.model");
const Customer = require("../../../models/customer.model");
const Product = require("../../../models/product.model");
const File = require("../../../models/file.model");

/**
 * Create a mock File document
 * Uses raw ObjectId for uploadedBy (no need to create real User)
 */
async function createFile(overrides = {}) {
  return File.create({
    originalName: "test-image.jpg",
    filename: `file-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    url: "https://cdn.test.com/test-image.jpg",
    uploadedBy: new mongoose.Types.ObjectId(), // ✔ valid ObjectId
    isArchived: false,
    ...overrides,
  });
}

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
  const file = await createFile();

  return Product.create({
    name: `Test Product ${now}`,
    slug: `test-product-${now}`,
    description: "Test product description",
    category: "test",
    status: "active",
    thumbnailImage: file._id,
    galleryImages: [],
    ...overrides,
  });
}

async function createVariant({ product, stock = 10, price = 5 } = {}) {
  const file = await createFile();

  return Variant.create({
    product: product._id,
    name: "Test Variant",
    sku: `SKU-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    price,
    stockQuantity: stock,
    reservedQuantity: 0,
    status: "active",
    thumbnailImage: file._id,
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
