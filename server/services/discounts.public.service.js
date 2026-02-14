const Discount = require("../models/discount.model");
const DiscountRedemption = require("../models/discountRedemption.model");
const Product = require("../models/product.model");

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase();
}

async function findDiscountByCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;

  return Discount.findOne({ code: normalized }).lean();
}

async function validateDiscountForOrder({ code, customerId, resolvedItems }) {
  const normalized = normalizeCode(code);
  if (!normalized) {
    return { success: false, message: "discountCode is required" };
  }

  const discount = await findDiscountByCode(normalized);
  if (!discount || !discount.isActive) {
    return { success: false, message: "Invalid discount code" };
  }

  const now = Date.now();
  if (discount.startsAt && new Date(discount.startsAt).getTime() > now) {
    return { success: false, message: "Discount is not active yet" };
  }
  if (discount.endsAt && new Date(discount.endsAt).getTime() < now) {
    // Keep DB state in sync with expiration.
    try {
      await Discount.updateOne(
        { _id: discount._id, isActive: true },
        { $set: { isActive: false } },
      );
    } catch {
      // ignore
    }
    return { success: false, message: "Discount has expired" };
  }

  if (!discount.stripePromotionCodeId && !discount.stripeCouponId) {
    return { success: false, message: "Discount is not configured in Stripe" };
  }

  const orderItems = Array.isArray(resolvedItems) ? resolvedItems : [];
  if (orderItems.length === 0) {
    return { success: false, message: "No order items to apply discount" };
  }

  // Eligibility check
  let isEligible = false;
  let eligibleSubtotalCents = 0;

  if (discount.scope === "global") {
    isEligible = true;
    eligibleSubtotalCents = Math.round(
      orderItems.reduce((sum, i) => sum + Number(i.subtotal || 0), 0) * 100,
    );
  } else if (discount.scope === "variant") {
    const allowed = new Set((discount.variantIds || []).map(String));
    const eligibleItems = orderItems.filter((i) =>
      allowed.has(String(i.variant)),
    );
    isEligible = eligibleItems.length > 0;
    eligibleSubtotalCents = Math.round(
      eligibleItems.reduce((sum, i) => sum + Number(i.subtotal || 0), 0) * 100,
    );
  } else if (discount.scope === "category") {
    const productIds = Array.from(
      new Set(orderItems.map((i) => String(i.product)).filter(Boolean)),
    );

    const products = await Product.find({ _id: { $in: productIds } })
      .select("category")
      .lean();

    const categoryByProductId = new Map(
      products.map((p) => [String(p._id), String(p.category || "")]),
    );

    const category = String(discount.category || "").toLowerCase();
    const eligibleItems = orderItems.filter((i) => {
      const c = String(
        categoryByProductId.get(String(i.product)) || "",
      ).toLowerCase();
      return Boolean(category) && c === category;
    });
    isEligible = eligibleItems.length > 0;
    eligibleSubtotalCents = Math.round(
      eligibleItems.reduce((sum, i) => sum + Number(i.subtotal || 0), 0) * 100,
    );
  }

  if (!isEligible) {
    return {
      success: false,
      message: "Discount does not apply to selected items",
    };
  }

  if (discount.scope !== "global") {
    const hasStripeProductRef = orderItems.some((i) =>
      Boolean(i.stripeProductId),
    );
    if (!hasStripeProductRef) {
      return {
        success: false,
        message:
          "Discount cannot be applied because matching items are not linked to Stripe products",
      };
    }
  }

  // Usage limits
  if (discount.maxRedemptions) {
    const totalUses = await DiscountRedemption.countDocuments({
      discount: discount._id,
    });
    if (totalUses >= discount.maxRedemptions) {
      return {
        success: false,
        message: "Discount has reached its usage limit",
      };
    }
  }

  if (discount.perCustomerLimit) {
    const customerUses = await DiscountRedemption.countDocuments({
      discount: discount._id,
      customer: customerId,
    });
    if (customerUses >= discount.perCustomerLimit) {
      return {
        success: false,
        message: "Discount usage limit reached for this customer",
      };
    }
  }

  // Compute discount amount (mirrors Stripe coupon behavior for products-only discounts)
  let discountCents = 0;
  if (eligibleSubtotalCents > 0) {
    if (discount.kind === "percent") {
      const percent = Number(discount.percentOff || 0);
      if (Number.isFinite(percent) && percent > 0) {
        discountCents = Math.round((eligibleSubtotalCents * percent) / 100);
      }
    } else if (discount.kind === "amount") {
      const amountOff = Number(discount.amountOff || 0);
      if (Number.isFinite(amountOff) && amountOff > 0) {
        discountCents = Math.min(
          eligibleSubtotalCents,
          Math.round(amountOff * 100),
        );
      }
    }
  }

  return {
    success: true,
    data: {
      discount,
      stripePromotionCodeId: discount.stripePromotionCodeId,
      stripeCouponId: discount.stripeCouponId,
      eligibleSubtotal: eligibleSubtotalCents / 100,
      discountAmount: discountCents / 100,
    },
  };
}

async function recordRedemption({
  discountId,
  customerId,
  orderId,
  stripeCheckoutSessionId,
}) {
  if (!discountId || !customerId || !orderId) return;

  const existing = await DiscountRedemption.findOne({ order: orderId })
    .select("_id")
    .lean();
  if (existing) return;

  await DiscountRedemption.create({
    discount: discountId,
    customer: customerId,
    order: orderId,
    stripeCheckoutSessionId,
    redeemedAt: new Date(),
  });
}

module.exports = {
  validateDiscountForOrder,
  recordRedemption,
};
