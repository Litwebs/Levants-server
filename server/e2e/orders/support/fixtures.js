"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Customer = require("../../../models/customer.model");
const Order = require("../../../models/order.model");
const Role = require("../../../models/role.model");
const User = require("../../../models/user.model");
const Variant = require("../../../models/variant.model");
const File = require("../../../models/file.model");
const { createProduct, createVariant } = require("../../../Tests/Orders/helpers/orderFactory");
const { seedDefaultRoles } = require("../../../scripts/seedDefaultRoles");
const { seedBusinessInfo } = require("../../../scripts/seedBusinessInfo");
const passwordUtil = require("../../../utils/password.util");
const stripe = require("../../../utils/stripe.util");

const PASSWORD = "OrdersBrowserE2E1!";
const ADDRESS = { line1: "1 Orders Test Lane", city: "Bradford", postcode: "BD5 0AL", country: "United Kingdom" };
const customersToClean = new Set();
let passwordHash;

async function cleanup() {
  for (const id of customersToClean) {
    await stripe.customers.del(id);
    customersToClean.delete(id);
  }
}

async function reset() {
  await cleanup();
  for (const collection of await mongoose.connection.db.collections()) await collection.deleteMany({});
  global.__E2E_EMAIL_OUTBOX__ = [];
  global.__ORDER_E2E_UPLOADS__ = [];
  global.__ORDER_E2E_FAIL_UPLOAD__ = false;
  await seedDefaultRoles();
  await seedBusinessInfo();
}

async function create(options = {}) {
  passwordHash ||= await passwordUtil.hashPassword(PASSWORD);
  const permissions = {
    admin: ["*"], reader: ["orders.read"], editor: ["orders.read", "orders.update", "products.read"],
    payer: ["orders.read", "orders.payment.update"], refunder: ["orders.read", "orders.refund"],
    deleter: ["orders.read", "orders.delete"], driver: ["orders.read", "orders.update", "delivery.routes.read"], none: [],
  };
  const users = {};
  for (const [key, values] of Object.entries(permissions)) {
    const name = key === "driver" ? "driver" : `orders-e2e-${key}`;
    const role = await Role.findOneAndUpdate({ name }, { $set: { permissions: values } }, { upsert: true, new: true });
    const email = `${key}@orders-e2e.example.invalid`;
    const user = await User.create({ name: `Orders ${key}`, email, passwordHash, role: role._id, status: "active", emailVerifiedAt: new Date() });
    users[key] = { id: String(user._id), email, password: PASSWORD };
  }
  const customers = [];
  for (const firstName of ["Alice", "Bob"]) customers.push(await Customer.create({
    firstName, lastName: "Orders", email: `${firstName.toLowerCase()}@orders-e2e.example.invalid`, phone: "07000000000",
    passwordHash, isGuest: false, status: "active", emailVerifiedAt: new Date(), addresses: [{ ...ADDRESS, label: "Home", isDefault: true }],
  }));
  const product = await createProduct({ name: "Orders E2E Dairy", slug: "orders-e2e-dairy" });
  const variants = {};
  for (const [key, price] of [["milk", 5], ["butter", 3], ["inactive", 2]]) {
    const variant = await createVariant({ product, stock: 100, price });
    variant.name = `Orders E2E ${key}`; variant.sku = `ORDER-E2E-${key.toUpperCase()}`;
    if (key === "inactive") variant.status = "inactive";
    await variant.save(); variants[key] = variant;
  }
  const future = new Date(); future.setUTCDate(future.getUTCDate() + 7); future.setUTCHours(0, 0, 0, 0);
  const specs = {
    importedUnpaid: { status: "unpaid", metadata: { manualImport: true } },
    importedPaid: { status: "paid", metadata: { manualImport: true } },
    importedPartial: { status: "partially_paid", amountPaid: 3, metadata: { manualImport: true } },
    websitePaid: { status: "paid" }, websiteUnpaid: { status: "unpaid" }, pending: { status: "pending" },
    delivered: { status: "paid", deliveryStatus: "delivered" }, returned: { status: "paid", deliveryStatus: "returned" },
    refunded: { status: "refunded" }, refundPending: { status: "refund_pending" },
    subscription: { status: "paid", orderType: "subscription_generated", subscription: new mongoose.Types.ObjectId() },
    archived: { status: "paid", archived: true, archivedAt: new Date() },
  };
  if (options.pagination) for (let i = 0; i < 55; i++) specs[`page${i}`] = { status: "paid" };
  const orders = {};
  let index = 0;
  for (const [key, values] of Object.entries(specs)) {
    const manual = !!values.metadata?.manualImport;
    const total = manual ? 11 : 10;
    const order = await Order.create({
      orderId: `ORD-E2E-${String(++index).padStart(3, "0")}`,
      customer: customers[key === "websiteUnpaid" ? 1 : 0]._id,
      items: [{ product: product._id, variant: variants.milk._id, name: variants.milk.name, sku: variants.milk.sku, price: 5, quantity: 2, subtotal: 10 }],
      subtotal: 10, total, totalBeforeDiscount: total, deliveryFee: manual ? 1 : 0, discountAmount: 0,
      deliveryAddress: ADDRESS, deliveryDate: future, location: { lat: 53.79, lng: -1.75 },
      reservationExpiresAt: new Date(Date.now() + 900_000), customerInstructions: "Leave in the porch", ...values,
    });
    orders[key] = { id: String(order._id), orderId: order.orderId, total, status: order.status };
  }
  await Variant.updateOne({ _id: variants.milk._id }, { $set: { reservedQuantity: 2 } });
  if (options.realPayment) {
    const customer = await stripe.customers.create({ email: customers[0].email, metadata: { purpose: "isolated-orders-browser-e2e", run: crypto.randomUUID() } });
    customersToClean.add(customer.id);
    const intent = await stripe.paymentIntents.create({ amount: 1000, currency: "gbp", customer: customer.id, payment_method: "pm_card_visa", confirm: true, automatic_payment_methods: { enabled: true, allow_redirects: "never" }, metadata: { purpose: "isolated-orders-browser-e2e" } });
    if (intent.status !== "succeeded") throw new Error("Stripe test payment was not captured");
    await Order.updateOne({ _id: orders.websitePaid.id }, { $set: { stripePaymentIntentId: intent.id, amountPaid: 10, paidAt: new Date() } });
    orders.websitePaid.paymentIntentId = intent.id;
  }
  return { users, customers: customers.map(c => ({ id: String(c._id), email: c.email, password: PASSWORD })),
    orders, variants: Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, { id: String(v._id), price: v.price, stock: 100 }])), future: future.toISOString() };
}

async function state(id) {
  const order = await Order.findById(id).lean();
  const variants = await Variant.find({}).select("_id stockQuantity reservedQuantity").lean();
  const files = await File.find({}).lean();
  let refunds = [];
  if (order?.stripePaymentIntentId) refunds = (await stripe.refunds.list({ payment_intent: order.stripePaymentIntentId, limit: 100 })).data.map(r => ({ id: r.id, amount: r.amount, status: r.status }));
  return { order, variants, files, refunds, emails: global.__E2E_EMAIL_OUTBOX__ || [], uploads: global.__ORDER_E2E_UPLOADS__ || [] };
}

module.exports = { create, reset, cleanup, state };
