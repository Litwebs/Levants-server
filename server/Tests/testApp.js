const express = require("express");
const cookieParser = require("cookie-parser");

// Ensure all referenced models are registered for populate() calls in E2E.
require("../models/file.model");

const authRoutes = require("../routes/auth.routes");
const accessRoutes = require("../routes/access.routes");
const businessInfoRoutes = require("../routes/businessInfo.routes");
const publicProductRoutes = require("../routes/products.public.routes");
const adminProductRoutes = require("../routes/products.admin.routes");
const adminVariantRoutes = require("../routes/variants.admin.routes");
const adminCustomerRoutes = require("../routes/customers.admin.routes");
const publicCustomerRoutes = require("../routes/customers.public.routes");
const publicDiscountRoutes = require("../routes/discounts.public.routes");
const publicOrderRoutes = require("../routes/orders.public.routes");
const adminOrderRoutes = require("../routes/orders.admin.routes");
const adminDiscountRoutes = require("../routes/discounts.admin.routes");
const stripeWebhookRoutes = require("../routes/stripe.webhook.routes");

const notFoundMiddleware = require("../middleware/notFound.middleware");
const errorMiddleware = require("../middleware/error.middleware");

const app = express();

app.set("trust proxy", 1);

// Stripe webhook must see RAW body, so mount before express.json
app.use("/api/webhooks/stripe", stripeWebhookRoutes);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/access", accessRoutes);
app.use("/api/business-info", businessInfoRoutes);

// 🟢 PUBLIC (frontend)
app.use("/api/products", publicProductRoutes);
app.use("/api/discounts", publicDiscountRoutes);
app.use("/api/orders", publicOrderRoutes);

// 🔐 ADMIN (dashboard)
app.use("/api/admin/products", adminProductRoutes);
app.use("/api/admin/products", adminVariantRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/discounts", adminDiscountRoutes);

// Backward-compatible admin variants routes (older tests/clients)
app.use("/api/admin/variants", adminVariantRoutes);
app.use("/api/admin/variants/products", adminVariantRoutes);

// Customers
app.use("/api/customers", publicCustomerRoutes);
app.use("/api/admin/customers", adminCustomerRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
