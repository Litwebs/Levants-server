const express = require("express");
const controller = require("../controllers/stripe.webhook.controller");

const router = express.Router();

// Stripe requires RAW body
router.post(
  "/",
  express.raw({ type: "application/json" }),
  controller.HandleStripeWebhook,
);

module.exports = router;
