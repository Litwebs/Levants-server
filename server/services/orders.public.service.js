const mongoose = require("mongoose");
const Order = require("../models/order.model");
const ProductVariant = require("../models/variant.model");
const stripe = require("../utils/stripe.util");
const Customer = require("../models/customer.model");
const { validateDiscountForOrder } = require("./discounts.public.service");

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

async function CreateOrder({ customerId, items, discountCode } = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!customerId) {
      await session.abortTransaction();
      session.endSession();
      return { success: false, message: "customerId is required" };
    }
    if (!Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return { success: false, message: "items is required" };
    }

    // 1️⃣ Resolve variants + reserve stock
    const resolvedItems = [];
    let subtotal = 0;

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

    const deliveryFee = 0;
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
          status: "pending",
          reservationExpiresAt,
        },
      ],
      { session },
    );
    const customer = await Customer.findById(customerId).select("email").lean();
    // 3️⃣ Create Stripe Checkout Session
    const stripeSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      // Ensures the customer cannot complete Checkout after the reservation expires.
      expires_at: Math.floor(reservationExpiresAt.getTime() / 1000),
      customer_email: customer.email ?? undefined,
      line_items: resolvedItems.map((item) => ({
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
      ...(appliedDiscount?.stripePromotionCodeId
        ? {
            discounts: [
              { promotion_code: appliedDiscount.stripePromotionCodeId },
            ],
          }
        : {}),
      metadata: {
        orderId: order._id.toString(), // 🔑 webhook anchor
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

    // 4️⃣ Attach Stripe session to order
    order.stripeCheckoutSessionId = stripeSession.id;

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

    return {
      success: true,
      data: {
        orderId: order._id,
        checkoutUrl: stripeSession.url,
      },
    };
  } catch (err) {
    console.error("Error creating order:", err);
    await session.abortTransaction();
    session.endSession();

    return {
      success: false,
      message: "Failed to create order",
    };
  }
}

module.exports = {
  CreateOrder,
};
