require("dotenv").config({
  override: true,
  quiet: true, // <- this suppresses that log line
});

module.exports = {
  env: process.env.NODE_ENV,
  port: Number(process.env.PORT || 5000),
  // Deprecated single origin; prefer allowedOrigins below
  corsOrigin: process.env.FRONTEND_URL_DEV,
  mongoUri:
    process.env.NODE_ENV === "test"
      ? process.env.MONGO_URI_TEST
      : process.env.MONGO_URI,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    apiVersion: process.env.STRIPE_API_VERSION || "2024-06-20",
    defaultCurrency: (
      process.env.STRIPE_DEFAULT_CURRENCY || "GBP"
    ).toUpperCase(),
    defaultTrialDays: Number(process.env.STRIPE_TRIAL_DAYS_DEFAULT || 14),
    webhooksEnabled: (process.env.STRIPE_WEBHOOKS_ENABLED || "true") === "true",
  },
  security: {
    passwordSaltRounds: Number(process.env.PASSWORD_SALT_ROUNDS || 12),
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  STRIPE: {
    SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  },
  RESEND_EMAIL_KEY: process.env.RESEND_URI,
  FRONTEND_URL:
    process.env.NODE_ENV === "production"
      ? process.env.FRONTEND_URL_PROD
      : process.env.FRONTEND_URL_DEV,
  CLIENT_FRONT_URL:
    process.env.NODE_ENV === "production"
      ? process.env.CLIENT_FRONT_URL_PROD
      : process.env.CLIENT_FRONT_URL_DEV,
  allowedOrigins:
    process.env.NODE_ENV === "production"
      ? [
          process.env.FRONTEND_URL_PROD,
          process.env.CLIENT_FRONT_URL_PROD,
        ].filter(Boolean)
      : [
          process.env.FRONTEND_URL_DEV,
          process.env.CLIENT_FRONT_URL_DEV,
          // local fallbacks
          "http://localhost:8080",
          "http://localhost:3000",
        ].filter(Boolean),
};
