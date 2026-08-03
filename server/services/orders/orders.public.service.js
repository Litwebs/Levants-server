const mongoose = require("mongoose");
const Order = require("../../models/order.model");
const ProductVariant = require("../../models/variant.model");
const stripe = require("../../utils/stripe.util");
const Customer = require("../../models/customer.model");
const { geocodeAddress } = require("../../Integration/google.geocode");
const { validateDiscountForOrder } = require("../discounts.public.service");
const {
  processInventoryAlertsForVariants,
} = require("../inventory.notifications.service");
const { normalizeBaseUrl } = require("../../utils/navigation.util");
const storeCreditService = require("../storeCredit.service");
const {
  finalizeStockForOrder,
  releaseReservedStock,
} = require("./orders.stock.service");
const {
  sendNewOrderAlertEmailToUsers,
  sendOrderConfirmationEmailToCustomer,
} = require("./orders.notifications.service");

// Stripe's minimum chargeable amount for GBP is 30p. If store credit reduces
// the amount due below this (but not to zero), we keep at least this much on
// the card so the Checkout Session can still be created.
const STRIPE_MIN_CHARGE_MINOR = 30;

function getReservationTtlMinutes() {
  const raw = process.env.ORDER_RESERVATION_TTL_MINUTES;
  const parsed = Number(raw);

  // Stripe Checkout sessions can't expire sooner than ~30 minutes.
  // Keeping the reservation window >= 30 minutes ensures an expired order
  // cannot still be paid for on the Checkout page.
  const fallback = 30;
  const minMinutes = 30;
  const maxMinutes = 24 * 60;

  let minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  minutes = Math.min(Math.max(minutes, minMinutes), maxMinutes);

  return minutes;
}

function buildFrontendUrl(pathname) {
  const base = normalizeBaseUrl(
    process.env.NODE_ENV === "production"
      ? process.env.CLIENT_FRONT_URL_PROD
      : process.env.CLIENT_FRONT_URL_DEV,
  );
  if (!base) return "";
  return new URL(pathname, `${base}/`).toString();
}

function isTransientTransactionError(err) {
  if (!err) return false;

  // MongoDB driver may attach these in different shapes depending on versions.
  if (
    Array.isArray(err.errorLabels) &&
    err.errorLabels.includes("TransientTransactionError")
  ) {
    return true;
  }
  if (err.errorLabelSet && typeof err.errorLabelSet.has === "function") {
    if (err.errorLabelSet.has("TransientTransactionError")) return true;
  }

  // Fallback by code/codeName for common transient cases.
  const transientCodeNames = new Set(["WriteConflict", "LockTimeout"]);
  if (err.codeName && transientCodeNames.has(err.codeName)) return true;

  const transientCodes = new Set([112, 24]);
  if (typeof err.code === "number" && transientCodes.has(err.code)) return true;

  return false;
}

async function CreateOrder({
  customerId,
  items,
  discountCode,
  creditToApplyMinor,
  deliveryAddress,
  deliveryDate,
  customerInstructions,
} = {}) {
  if (!deliveryAddress) {
    return { success: false, message: "Delivery address is required" };
  }

  let location;

  try {
    location = await geocodeAddress(deliveryAddress);
  } catch (err) {
    console.error("Geocoding failed:", err.message);
    return {
      success: false,
      message: "Invalid delivery address",
    };
  }

  if (!customerId) {
    return { success: false, message: "customerId is required" };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, message: "items is required" };
  }

  const customer = await Customer.findById(customerId)
    .select("email creditBalance")
    .lean();
  if (!customer) {
    return { success: false, message: "Customer not found" };
  }

  const requestedCreditMinor = Math.max(
    0,
    Math.round(Number(creditToApplyMinor) || 0),
  );

  // Store credit cannot be combined with a discount code: Stripe Checkout
  // allows only a single discount entry per session.
  if (requestedCreditMinor > 0 && discountCode) {
    return {
      success: false,
      message: "Store credit can't be combined with a discount code.",
    };
  }

  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1️⃣ Resolve variants + reserve stock
      const resolvedItems = [];
      let subtotal = 0;
      const lastKnownStockByVariantId = {};

      for (const item of items) {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          await session.abortTransaction();
          session.endSession();
          return { success: false, message: "Invalid quantity" };
        }

        const variant = await ProductVariant.findOneAndUpdate(
          {
            _id: item.variantId,
            status: "active",
            $expr: {
              $gte: [
                {
                  $subtract: [
                    "$stockQuantity",
                    { $ifNull: ["$reservedQuantity", 0] },
                  ],
                },
                quantity,
              ],
            },
          },
          {
            $inc: { reservedQuantity: quantity },
          },
          {
            new: true,
            session,
          },
        );

        if (!variant) {
          await session.abortTransaction();
          session.endSession();
          return { success: false, message: "Not enough stock available" };
        }

        // Capture last-known available stock before reservation for out-of-stock emails
        const availableAfter =
          Number(variant.stockQuantity || 0) -
          Number(variant.reservedQuantity || 0);
        lastKnownStockByVariantId[String(variant._id)] =
          availableAfter + quantity;

        const lineSubtotal = variant.price * quantity;

        resolvedItems.push({
          product: variant.product,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price,
          stripeProductId: variant.stripeProductId,
          quantity,
          subtotal: lineSubtotal,
        });

        subtotal += lineSubtotal;
      }

      const deliveryFee = 1;
      const totalBeforeDiscount = subtotal + deliveryFee;

      let appliedDiscount = null;
      let discountAmount = 0;
      if (discountCode) {
        const validation = await validateDiscountForOrder({
          code: discountCode,
          customerId,
          resolvedItems,
        });

        if (!validation.success) {
          await session.abortTransaction();
          session.endSession();
          return { success: false, message: validation.message };
        }

        appliedDiscount = validation.data.discount;

        const amount = Number(validation.data.discountAmount || 0);
        discountAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
      }

      const total = Math.max(0, totalBeforeDiscount - discountAmount);

      // Store credit application (in MINOR units / pence).
      const totalMinor = Math.round(total * 100);
      let creditAppliedMinor = 0;
      let amountDueMinor = totalMinor;
      if (requestedCreditMinor > 0) {
        const balanceMinor = Math.max(
          0,
          Math.round(Number(customer.creditBalance) || 0),
        );
        creditAppliedMinor = Math.min(
          requestedCreditMinor,
          balanceMinor,
          totalMinor,
        );
        amountDueMinor = totalMinor - creditAppliedMinor;

        // If a card charge remains, keep it at or above Stripe's minimum.
        if (amountDueMinor > 0 && amountDueMinor < STRIPE_MIN_CHARGE_MINOR) {
          const shortfall = STRIPE_MIN_CHARGE_MINOR - amountDueMinor;
          creditAppliedMinor = Math.max(0, creditAppliedMinor - shortfall);
          amountDueMinor = totalMinor - creditAppliedMinor;
        }
      }
      const isFullCreditCoverage =
        creditAppliedMinor > 0 && amountDueMinor <= 0;

      const reservationTtlMinutes = getReservationTtlMinutes();
      const reservationExpiresAt = new Date(
        Date.now() + reservationTtlMinutes * 60 * 1000,
      );

      // 2️⃣ Create Order (pending payment)
      const [order] = await Order.create(
        [
          {
            customer: customerId,
            items: resolvedItems,
            subtotal,
            deliveryFee,
            total,
            totalBeforeDiscount,
            discountAmount,
            isDiscounted: discountAmount > 0,
            creditApplied: creditAppliedMinor,
            status: "pending",
            reservationExpiresAt,
            customerInstructions,
            deliveryAddress,
            location,
            ...(deliveryDate ? { deliveryDate } : {}),
          },
        ],
        { session },
      );

      // 3️⃣ Settlement path
      // When store credit covers the whole order, skip Stripe entirely and
      // settle with credit. Everything past the commit is handled locally so a
      // post-commit failure never re-enters the retry loop (no duplicate order).
      if (isFullCreditCoverage) {
        await order.save({ session });
        await session.commitTransaction();
        session.endSession();

        // Redeem the credit (atomic; guards against concurrent spend).
        const redemption = await storeCreditService.redeemCredit({
          customerId,
          amountMinor: creditAppliedMinor,
          type: "order_redemption",
          orderId: order._id,
          reason: `Order ${order.orderId}`,
        });

        if (!redemption.ok) {
          // Could not deduct credit (e.g. balance changed): roll back the order
          // and release the reserved stock so nothing is left dangling.
          try {
            await releaseReservedStock(order._id, "cancelled");
          } catch (releaseErr) {
            console.error(
              "Failed to release stock after credit redemption failure:",
              releaseErr,
            );
          }
          return {
            success: false,
            message: redemption.message || "Insufficient store credit",
          };
        }

        // Mark the order paid and convert reserved stock to sold.
        try {
          await finalizeStockForOrder(order._id);
        } catch (finalizeErr) {
          console.error(
            "Failed to finalize fully credit-paid order; reversing credit:",
            finalizeErr,
          );
          // Compensate: return the redeemed credit and release the stock.
          try {
            await storeCreditService.addCredit({
              customerId,
              amountMinor: creditAppliedMinor,
              type: "order_redemption_reversal",
              orderId: order._id,
              reason: `Reversed redemption for ${order.orderId}`,
            });
          } catch (reverseErr) {
            console.error("Failed to reverse store credit:", reverseErr);
          }
          try {
            await releaseReservedStock(order._id, "failed");
          } catch (releaseErr) {
            console.error(
              "Failed to release stock after finalize failure:",
              releaseErr,
            );
          }
          return { success: false, message: "Failed to create order" };
        }

        // Best-effort notifications (mirror the webhook-paid flow).
        try {
          await sendNewOrderAlertEmailToUsers({ orderId: order._id });
        } catch {
          // ignore
        }
        try {
          await sendOrderConfirmationEmailToCustomer({ orderId: order._id });
        } catch {
          // ignore
        }

        // Inventory alerts (best-effort).
        try {
          await processInventoryAlertsForVariants({
            variantIds: resolvedItems.map((i) => i.variant),
            lastKnownStockByVariantId,
          });
        } catch {
          // ignore
        }

        return {
          success: true,
          data: {
            orderId: order._id,
            checkoutUrl: null,
            paidWithCredit: true,
          },
        };
      }

      // Partial credit: a one-time Stripe coupon reduces the card charge.
      let creditCoupon = null;
      if (creditAppliedMinor > 0) {
        creditCoupon = await stripe.coupons.create({
          amount_off: creditAppliedMinor,
          currency: "gbp",
          duration: "once",
          name: "Store credit",
        });
      }

      // 4️⃣ Create Stripe Checkout Session
      const stripeSession = await stripe.checkout.sessions.create({
        mode: "payment",
        // Ensures the customer cannot complete Checkout after the reservation expires.
        expires_at: Math.floor(reservationExpiresAt.getTime() / 1000),
        customer_email: customer.email ?? undefined,
        line_items: [
          ...resolvedItems.map((item) => ({
            price_data: {
              currency: "gbp",
              ...(item.stripeProductId
                ? { product: item.stripeProductId }
                : {
                    product_data: {
                      name: item.name,
                    },
                  }),
              unit_amount: Math.round(item.price * 100),
            },
            quantity: item.quantity,
          })),
          {
            price_data: {
              currency: "gbp",
              product_data: {
                name: "Delivery fee",
              },
              unit_amount: Math.round(deliveryFee * 100),
            },
            quantity: 1,
          },
        ],
        ...(creditCoupon
          ? { discounts: [{ coupon: creditCoupon.id }] }
          : appliedDiscount?.stripePromotionCodeId ||
              appliedDiscount?.stripeCouponId
            ? {
                discounts: [
                  appliedDiscount?.stripePromotionCodeId
                    ? { promotion_code: appliedDiscount.stripePromotionCodeId }
                    : { coupon: appliedDiscount.stripeCouponId },
                ],
              }
            : {}),
        metadata: {
          orderId: order._id.toString(), // 🔑 webhook anchor
          ...(creditAppliedMinor > 0
            ? { creditAppliedMinor: String(creditAppliedMinor) }
            : {}),
          ...(appliedDiscount
            ? {
                discountId: appliedDiscount._id.toString(),
                discountCode: appliedDiscount.code,
              }
            : {}),
        },
        success_url: buildFrontendUrl("/checkout/success"),
        cancel_url: buildFrontendUrl("/checkout/cancel"),
      });

      // 5️⃣ Attach Stripe session to order
      order.stripeCheckoutSessionId = stripeSession.id;

      if (creditAppliedMinor > 0) {
        order.metadata = {
          ...(order.metadata || {}),
          creditAppliedMinor: String(creditAppliedMinor),
        };
      }

      if (appliedDiscount) {
        order.metadata = {
          ...(order.metadata || {}),
          discountId: appliedDiscount._id.toString(),
          discountCode: appliedDiscount.code,
          stripePromotionCodeId: appliedDiscount.stripePromotionCodeId,
        };
      }
      await order.save({ session });

      // 5️⃣ Commit everything
      await session.commitTransaction();
      session.endSession();

      // Inventory alerts (best-effort; run after commit)
      try {
        await processInventoryAlertsForVariants({
          variantIds: resolvedItems.map((i) => i.variant),
          lastKnownStockByVariantId,
        });
      } catch {
        // ignore
      }

      return {
        success: true,
        data: {
          orderId: order._id,
          checkoutUrl: stripeSession.url,
        },
      };
    } catch (err) {
      console.error("Error creating order:", err);
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
      session.endSession();

      if (isTransientTransactionError(err) && attempt < maxAttempts) {
        // Small backoff + jitter; keep this minimal for API latency.
        const jitter = Math.floor(Math.random() * 25);
        await new Promise((r) => setTimeout(r, 50 * attempt + jitter));
        continue;
      }

      return {
        success: false,
        message: "Failed to create order",
      };
    }
  }

  // Should never reach here, but keep a safe fallback.
  return {
    success: false,
    message: "Failed to create order",
  };
}

module.exports = {
  CreateOrder,
};
