const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const cookieParser = require("cookie-parser");

const { allowedOrigins, env } = require("./config/env");
const { sendOk } = require("./utils/response.util");
const logger = require("./utils/logger.util");

// Middleware
const errorMiddleware = require("./middleware/error.middleware");
const notFoundMiddleware = require("./middleware/notFound.middleware");
const { seedDefaultRoles } = require("./scripts/seedDefaultRoles");
const { seedBusinessInfo } = require("./scripts/seedBusinessInfo");
const stripeWebhookRoutes = require("./routes/stripe.webhook.routes");

const {
  startOrderExpirationCron,
} = require("./scripts/orderExpiration.scheduler");
const {
  startInvitationCleanupCron,
} = require("./scripts/userInvitation.scheduler");
const {
  startSubscriptionGenerationCron,
} = require("./scripts/subscriptionGeneration.scheduler");

// Routes
const authRoutes = require("./routes/auth.routes");
const accessRoutes = require("./routes/access.routes");
const businessInfoRoutes = require("./routes/businessInfo.routes");
const subscriptionSettingsRoutes = require("./routes/subscriptionSettings.routes");
const publicProductRoutes = require("./routes/products.public.routes");
const adminProductRoutes = require("./routes/products.admin.routes");
const adminVariantRoutes = require("./routes/variants.admin.routes");
const publicCustomerRoutes = require("./routes/customers.public.routes");
const adminCustomerRoutes = require("./routes/customers.admin.routes");
const adminOrderRoutes = require("./routes/orders.admin.routes");
const publicOrderRoutes = require("./routes/orders.public.routes");
const adminAnalyticsRoutes = require("./routes/analytics.admin.routes");
const adminDiscountRoutes = require("./routes/discounts.admin.routes");
const publicDiscountRoutes = require("./routes/discounts.public.routes");
const deliveryRoutes = require("./routes/delivery.routes");
const publicDeliveryRoutes = require("./routes/delivery.public.routes");
const adminAnnouncementRoutes = require("./routes/announcements.admin.routes");
const publicAnnouncementRoutes = require("./routes/announcements.public.routes");
const adminCategoryRoutes = require("./routes/categories.admin.routes");
const publicCategoryRoutes = require("./routes/categories.public.routes");

// ===== Customer portal routes =====
const portalAuthRoutes = require("./routes/portal/customerAuth.routes");
const portalProductRoutes = require("./routes/portal/customerProducts.routes");
const portalOrderRoutes = require("./routes/portal/customerOrders.routes");
const portalAddressRoutes = require("./routes/portal/customerAddresses.routes");
const portalSubscriptionRoutes = require("./routes/portal/customerSubscriptions.routes");
const portalCreditRoutes = require("./routes/portal/customerCredits.routes");
const {
  notifRouter,
  supportRouter,
  paymentRouter,
} = require("./routes/portal/customerMisc.routes");
const adminSubscriptionRoutes = require("./routes/portal/adminSubscriptions.routes");
const {
  supportRouter: adminSupportRouter,
  paymentsRouter: adminPaymentsRouter,
  reportsRouter: adminReportsRouter,
} = require("./routes/portal/adminMisc.routes");

const app = express();
app.set("trust proxy", 1);

// app.use(helmet());

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https:", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          "data:",
          "https://res.cloudinary.com",
          "https://*.basemaps.cartocdn.com",
        ],
        fontSrc: ["'self'", "https:", "data:"],
        connectSrc: [
          // "'self'",
          "https://levantsdairy.co.uk",
          "https://api.levantsdairy.co.uk",
          "http://localhost:8080",
        ],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
      },
    },
  }),
);

if (env === "development") {
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
}

// ✅ Stripe webhook routes MUST be before express.json()
app.use("/api/webhooks/stripe", stripeWebhookRoutes);
// Backward-compatible path used by some tooling
app.use("/api/stripe/webhook", stripeWebhookRoutes);

// Body parsing (after webhooks)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static assets for email templates (logo, etc.)
// Note: path is intentionally `/assests` (legacy spelling used by clients/templates).
app.use(
  "/assests",
  express.static(path.join(__dirname, "Templates", "assets")),
);

// Seed + start background jobs on startup
(async () => {
  try {
    await seedDefaultRoles();
    await seedBusinessInfo();

    // ⏰ START CRON JOBS
    startOrderExpirationCron();
    startInvitationCleanupCron();
    startSubscriptionGenerationCron();
  } catch (err) {
    logger.error("Startup failed", err);
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
app.use("/api/admin/subscription-settings", subscriptionSettingsRoutes);

// 🟢 PUBLIC (frontend)
app.use("/api/products", publicProductRoutes);
app.use("/api/discounts", publicDiscountRoutes);
app.use("/api/delivery", publicDeliveryRoutes);

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

// Discounts / Promotions
app.use("/api/admin/discounts", adminDiscountRoutes);

// Delivery
app.use("/api/admin/delivery", deliveryRoutes);

// Announcements
app.use("/api/announcements", publicAnnouncementRoutes);
app.use("/api/admin/announcements", adminAnnouncementRoutes);

// Categories
app.use("/api/categories", publicCategoryRoutes);
app.use("/api/admin/categories", adminCategoryRoutes);

// ===== Customer Portal =====
app.use("/api/portal/auth", portalAuthRoutes);
app.use("/api/portal/products", portalProductRoutes);
app.use("/api/portal/orders", portalOrderRoutes);
app.use("/api/portal/addresses", portalAddressRoutes);
app.use("/api/portal/subscriptions", portalSubscriptionRoutes);
app.use("/api/portal/credits", portalCreditRoutes);
app.use("/api/portal/notifications", notifRouter);
app.use("/api/portal/support-requests", supportRouter);
app.use("/api/portal/payments", paymentRouter);

// ===== Admin Portal Extensions =====
app.use("/api/admin/subscriptions", adminSubscriptionRoutes);
app.use("/api/admin/support-requests", adminSupportRouter);
app.use("/api/admin/payments", adminPaymentsRouter);
app.use("/api/admin/reports", adminReportsRouter);

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
