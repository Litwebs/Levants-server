const mongoose = require("mongoose");
const Order = require("../models/order.model");
const ProductVariant = require("../models/variant.model");
const stripe = require("../utils/stripe.util");

function normalizeBaseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");

  // In dev people often set FRONTEND_URL_DEV=localhost:3000
  if (process.env.NODE_ENV !== "production") {
    return `http://${value.replace(/\/$/, "")}`;
  }

  return value.replace(/\/$/, "");
}

function buildFrontendUrl(pathname) {
  const base = normalizeBaseUrl(process.env.FRONTEND_URL_DEV);
  if (!base) return "";
  return new URL(pathname, `${base}/`).toString();
}

async function CreateOrder({ customerId, items } = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!customerId) {
      throw new Error("CUSTOMER_REQUIRED");
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("ITEMS_REQUIRED");
    }

    // 1️⃣ Resolve variants + reserve stock
    const resolvedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("INVALID_QUANTITY");
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
        throw new Error("INSUFFICIENT_STOCK");
      }

      const lineSubtotal = variant.price * quantity;

      resolvedItems.push({
        product: variant.product,
        variant: variant._id,
        name: variant.name,
        sku: variant.sku,
        price: variant.price,
        quantity,
        subtotal: lineSubtotal,
      });

      subtotal += lineSubtotal;
    }

    const deliveryFee = 0;
    const total = subtotal + deliveryFee;

    // 2️⃣ Create Order (pending payment)
    const [order] = await Order.create(
      [
        {
          customer: customerId,
          items: resolvedItems,
          subtotal,
          deliveryFee,
          total,
          status: "pending",
          reservationExpiresAt: new Date(
            Date.now() + 15 * 60 * 1000, // 15 minutes
          ),
        },
      ],
      { session },
    );

    // 3️⃣ Create Stripe Checkout Session
    const stripeSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: resolvedItems.map((item) => ({
        price_data: {
          currency: "gbp",
          product_data: {
            name: item.name,
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })),
      metadata: {
        orderId: order._id.toString(), // 🔑 webhook anchor
      },
      success_url: buildFrontendUrl("/checkout/success"),
      cancel_url: buildFrontendUrl("/checkout/cancel"),
    });

    // 4️⃣ Attach Stripe session to order
    order.stripeCheckoutSessionId = stripeSession.id;
    await order.save({ session });

    // 5️⃣ Commit everything
    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      data: {
        orderId: order._id,
        checkoutUrl: stripeSession.url,
      },
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("CreateOrder error:", err);

    return {
      success: false,
      message:
        err.message === "INSUFFICIENT_STOCK"
          ? "Not enough stock available"
          : err.message === "CUSTOMER_REQUIRED"
            ? "customerId is required"
            : err.message === "ITEMS_REQUIRED"
              ? "items is required"
              : err.message === "INVALID_QUANTITY"
                ? "Invalid quantity"
                : "Failed to create order",
    };
  }
}

module.exports = {
  CreateOrder,
};
