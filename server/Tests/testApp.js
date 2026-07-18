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
const publicDeliveryRoutes = require("../routes/delivery.public.routes");
const adminDeliveryRoutes = require("../routes/delivery.routes");
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
app.use("/api/delivery", publicDeliveryRoutes);
app.use("/api/orders", publicOrderRoutes);

// 🔐 ADMIN (dashboard)
app.use("/api/admin/products", adminProductRoutes);
app.use("/api/admin/products", adminVariantRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/discounts", adminDiscountRoutes);
app.use("/api/admin/delivery", adminDeliveryRoutes);

// Backward-compatible admin variants routes (older tests/clients)
app.use("/api/admin/variants", adminVariantRoutes);
app.use("/api/admin/variants/products", adminVariantRoutes);

// Customers
app.use("/api/customers", publicCustomerRoutes);
app.use("/api/admin/customers", adminCustomerRoutes);

// ===== Customer portal =====
const portalAuthRoutes = require("../routes/portal/customerAuth.routes");
const portalOrderRoutes = require("../routes/portal/customerOrders.routes");
const portalAddressRoutes = require("../routes/portal/customerAddresses.routes");
const portalSubscriptionRoutes = require("../routes/portal/customerSubscriptions.routes");
const {
  notifRouter,
  supportRouter,
  paymentRouter,
} = require("../routes/portal/customerMisc.routes");
const adminSubscriptionRoutes = require("../routes/portal/adminSubscriptions.routes");
const {
  supportRouter: adminSupportRouter,
  paymentsRouter: adminPaymentsRouter,
  reportsRouter: adminReportsRouter,
} = require("../routes/portal/adminMisc.routes");

app.use("/api/portal/auth", portalAuthRoutes);
app.use("/api/portal/orders", portalOrderRoutes);
app.use("/api/portal/addresses", portalAddressRoutes);
app.use("/api/portal/subscriptions", portalSubscriptionRoutes);
app.use("/api/portal/notifications", notifRouter);
app.use("/api/portal/support-requests", supportRouter);
app.use("/api/portal/payments", paymentRouter);
app.use("/api/admin/subscriptions", adminSubscriptionRoutes);
app.use("/api/admin/support-requests", adminSupportRouter);
app.use("/api/admin/payments", adminPaymentsRouter);
app.use("/api/admin/reports", adminReportsRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
