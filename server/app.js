const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const cookieParser = require("cookie-parser");

const { allowedOrigins, env } = require("./config/env");
const { sendOk } = require("./utils/response.util");

// Middleware
const errorMiddleware = require("./middleware/error.middleware");
const notFoundMiddleware = require("./middleware/notFound.middleware");
const { seedDefaultRoles } = require("./scripts/seedDefaultRoles");
const { seedBusinessInfo } = require("./scripts/seedBusinessInfo");
const stripeWebhookRoutes = require("./routes/stripe.webhook.routes");

const {
  startOrderExpirationCron,
} = require("./scripts/orderExpiration.scheduler");

// Routes
const authRoutes = require("./routes/auth.routes");
const accessRoutes = require("./routes/access.routes");
const businessInfoRoutes = require("./routes/businessInfo.routes");
const publicProductRoutes = require("./routes/products.public.routes");
const adminProductRoutes = require("./routes/products.admin.routes");
const adminVariantRoutes = require("./routes/variants.admin.routes");
const publicCustomerRoutes = require("./routes/customers.public.routes");
const adminCustomerRoutes = require("./routes/customers.admin.routes");
const adminOrderRoutes = require("./routes/orders.admin.routes");
const publicOrderRoutes = require("./routes/orders.public.routes");
const adminAnalyticsRoutes = require("./routes/analytics.admin.routes");

const app = express();
app.set("trust proxy", 1);

// Basic security headers
app.use(helmet());

// CORS (enabled for both dev and prod with explicit allowed origins)
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    exposedHeaders: [
      "Content-Disposition",
      "X-File-Meta",
      "X-File-Name",
      "X-File-Size",
      "X-File-Mime",
    ],
  }),
);

// ✅ Stripe webhook routes MUST be before express.json()
app.use("/api/webhooks/stripe", stripeWebhookRoutes);
// Backward-compatible path used by some tooling
app.use("/api/stripe/webhook", stripeWebhookRoutes);

// Body parsing (after webhooks)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Seed + start background jobs on startup
(async () => {
  try {
    await seedDefaultRoles();
    await seedBusinessInfo();

    // ⏰ START CRON JOBS
    startOrderExpirationCron();
  } catch (err) {
    console.error("❌ Startup failed", err);
    process.exit(1);
  }
})();

// Health check endpoint
app.get("/health", (req, res) => {
  return sendOk(res, {
    message: "API is healthy",
    env,
    timestamp: new Date().toISOString(),
  });
});

// API routes
// API routes
app.use("/api/auth", authRoutes);
app.use("/api/access", accessRoutes);
app.use("/api/business-info", businessInfoRoutes);

// 🟢 PUBLIC (frontend)
app.use("/api/products", publicProductRoutes);

// 🔐 ADMIN (dashboard)
app.use("/api/admin/products", adminProductRoutes);
app.use("/api/admin/products", adminVariantRoutes);

// Backward-compatible admin variants routes (older clients)
app.use("/api/admin/variants", adminVariantRoutes);
app.use("/api/admin/variants/products", adminVariantRoutes);

// Customers
app.use("/api/customers", publicCustomerRoutes);
app.use("/api/admin/customers", adminCustomerRoutes);

// Orders
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/orders", publicOrderRoutes);

// Analytics
app.use("/api/admin/analytics", adminAnalyticsRoutes);

// Static
const buildPath = path.join(__dirname, "..", "client", "build");
app.use(express.static(buildPath));

// SPA fallback
if (env === "production") {
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api")) return next();
    return res.sendFile(path.join(buildPath, "index.html"));
  });
}

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
