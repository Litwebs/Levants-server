"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const HOST = "127.0.0.1";
const API_PORT = 5001;
const ADMIN_ORIGIN = "http://127.0.0.1:4174";
const SERVER_ROOT = path.resolve(__dirname, "../..");

let replicaSet;
let apiServer;
let isolatedWorkingDirectory;
let shuttingDown = false;

const listen = (server, port) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, resolve);
  });

const close = async (server) => {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
};

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  await close(apiServer);
  await mongoose.disconnect().catch(() => {});
  await replicaSet?.stop().catch(() => {});
  if (isolatedWorkingDirectory) {
    fs.rmSync(isolatedWorkingDirectory, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

function configureEnvironment() {
  process.env.NODE_ENV = "development";
  process.env.PORT = String(API_PORT);
  process.env.FRONTEND_URL_DEV = ADMIN_ORIGIN;
  process.env.CLIENT_FRONT_URL_DEV = ADMIN_ORIGIN;
  process.env.JWT_ACCESS_SECRET = "analytics-e2e-access-secret";
  process.env.JWT_REFRESH_SECRET = "analytics-e2e-refresh-secret";
  process.env.JWT_ACCESS_EXPIRES_IN = "15m";
  process.env.JWT_REFRESH_EXPIRES_IN = "7d";
  process.env.JWT_2FA_SECRET = "analytics-e2e-2fa-secret";
  process.env.STRIPE_SECRET_KEY = "sk_test_analytics_e2e_placeholder";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_analytics_e2e_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_analytics_e2e_placeholder";
  process.env.STRIPE_WEBHOOKS_ENABLED = "false";
  process.env.STRIPE_DEFAULT_CURRENCY = "GBP";
  process.env.RESEND_URI = "re_analytics_e2e_never_send";
  process.env.RESEND_EMAIL_KEY = "re_analytics_e2e_never_send";
  process.env.PASSWORD_SALT_ROUNDS = "4";
  process.env.RATE_LIMIT_LOGIN_MAX = "1000";
  process.env.RATE_LIMIT_AUTH_MAX = "5000";
  process.env.RATE_LIMIT_API_MAX = "5000";
  process.env.TZ = "Europe/London";
}

async function seedFixture() {
  const Role = require(path.join(SERVER_ROOT, "models/role.model"));
  const User = require(path.join(SERVER_ROOT, "models/user.model"));
  const File = require(path.join(SERVER_ROOT, "models/file.model"));
  const Product = require(path.join(SERVER_ROOT, "models/product.model"));
  const ProductVariant = require(path.join(SERVER_ROOT, "models/variant.model"));
  const Customer = require(path.join(SERVER_ROOT, "models/customer.model"));
  const Order = require(path.join(SERVER_ROOT, "models/order.model"));
  const passwordUtil = require(path.join(SERVER_ROOT, "utils/password.util"));

  const adminRole = await Role.create({
    name: "admin",
    description: "Analytics E2E admin",
    permissions: ["*"],
    isSystem: true,
  });
  const admin = await User.create({
    name: "Analytics E2E Admin",
    email: "analytics.admin@example.com",
    passwordHash: await passwordUtil.hashPassword("AnalyticsE2E1!"),
    role: adminRole._id,
    status: "active",
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    twoFactorEnabled: false,
  });

  const image = await File.create({
    originalName: "analytics-e2e.png",
    filename: "analytics-e2e-image",
    mimeType: "image/png",
    sizeBytes: 128,
    url: "https://example.test/analytics-e2e.png",
    uploadedBy: admin._id,
    isArchived: false,
  });

  const milk = await Product.create({
    name: "Analytics Milk",
    slug: "analytics-milk",
    category: "Analytics",
    description: "Analytics E2E product",
    status: "active",
    thumbnailImage: image._id,
    galleryImages: [],
  });
  const eggs = await Product.create({
    name: "Analytics Eggs",
    slug: "analytics-eggs",
    category: "Analytics",
    description: "Analytics E2E product",
    status: "active",
    thumbnailImage: image._id,
    galleryImages: [],
  });

  const milkVariant = await ProductVariant.create({
    product: milk._id,
    name: "Milk 1L",
    sku: "AN-MILK-1L",
    price: 4.5,
    stockQuantity: 3,
    reservedQuantity: 0,
    lowStockAlert: 5,
    status: "active",
    thumbnailImage: image._id,
  });
  const eggsVariant = await ProductVariant.create({
    product: eggs._id,
    name: "Eggs 6 Pack",
    sku: "AN-EGGS-6",
    price: 6,
    stockQuantity: 20,
    reservedQuantity: 0,
    lowStockAlert: 5,
    status: "active",
    thumbnailImage: image._id,
  });

  const customer = await Customer.create({
    firstName: "Analytics",
    lastName: "Customer",
    email: "analytics.customer@example.com",
    phone: "07000000000",
    isGuest: true,
  });

  const common = {
    customer: customer._id,
    deliveryAddress: {
      line1: "1 Analytics Road",
      city: "Bradford",
      postcode: "BD1 1AA",
      country: "United Kingdom",
    },
    location: { lat: 53.7939, lng: -1.7521 },
    deliveryFee: 0,
    status: "paid",
    reservationExpiresAt: new Date("2027-01-01T00:00:00.000Z"),
  };

  await Order.create({
    ...common,
    orderId: "ORD-AN-WEB",
    items: [{
      product: milk._id,
      productName: "Analytics Milk",
      variant: milkVariant._id,
      name: "Milk 1L",
      sku: "AN-MILK-1L",
      price: 5,
      quantity: 2,
      subtotal: 10,
    }],
    subtotal: 10,
    total: 10,
    paidAt: new Date("2026-06-10T12:00:00.000Z"),
    orderType: "one_time",
  });

  await Order.create({
    ...common,
    orderId: "ORD-AN-SUB",
    items: [{
      product: eggs._id,
      productName: "Analytics Eggs",
      variant: eggsVariant._id,
      name: "Eggs 6 Pack",
      sku: "AN-EGGS-6",
      price: 6,
      quantity: 1,
      subtotal: 6,
    }],
    subtotal: 6,
    total: 6,
    paidAt: new Date("2026-06-11T12:00:00.000Z"),
    orderType: "subscription_generated",
    subscription: new mongoose.Types.ObjectId(),
  });

  await Order.create({
    ...common,
    orderId: "ORD-AN-IMPORT",
    items: [{
      product: milk._id,
      productName: "Analytics Milk",
      variant: milkVariant._id,
      name: "Milk 1L",
      sku: "AN-MILK-1L",
      price: 5,
      quantity: 1,
      subtotal: 5,
    }],
    subtotal: 5,
    total: 5,
    paidAt: new Date("2026-06-12T12:00:00.000Z"),
    orderType: "subscription_generated",
    subscription: new mongoose.Types.ObjectId(),
    metadata: { manualImport: true },
  });
}

async function start() {
  configureEnvironment();

  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const mongoUri = replicaSet.getUri("levants-analytics-e2e");
  process.env.MONGO_URI = mongoUri;
  process.env.MONGO_URI_TEST = mongoUri;

  isolatedWorkingDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "levants-analytics-e2e-"),
  );
  process.chdir(isolatedWorkingDirectory);

  await mongoose.connect(mongoUri, { autoIndex: true });
  await seedFixture();

  const app = require(path.join(SERVER_ROOT, "app"));
  apiServer = http.createServer(app);
  await listen(apiServer, API_PORT);

  process.stdout.write("[analytics-e2e] API ready on http://127.0.0.1:5001\n");
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));
process.on("uncaughtException", (error) => {
  process.stderr.write(`[analytics-e2e] fatal: ${error.message}\n`);
  void shutdown(1);
});
process.on("unhandledRejection", (error) => {
  process.stderr.write(
    `[analytics-e2e] rejected: ${error?.message || error}\n`,
  );
  void shutdown(1);
});

start().catch((error) => {
  process.stderr.write(`[analytics-e2e] startup failed: ${error.message}\n`);
  void shutdown(1);
});
