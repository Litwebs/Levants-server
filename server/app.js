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

// Routes
const authRoutes = require("./routes/auth.routes");
const accessRoutes = require("./routes/access.routes");

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

// Body parsing (after webhooks)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

(async () => {
  try {
    await seedDefaultRoles();
  } catch (err) {
    console.error("❌ Failed to seed default roles", err);
    process.exit(1);
  }
})();

app.get("/health", (req, res) => {
  return sendOk(res, {
    message: "API is healthy",
    env,
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/access", accessRoutes);

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
