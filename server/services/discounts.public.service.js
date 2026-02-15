const Discount = require("../models/discount.model");
const DiscountRedemption = require("../models/discountRedemption.model");
const Product = require("../models/product.model");
const Variant = require("../models/variant.model");

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

async function validateDiscountForCart({
  customerId,
  discountCode,
  items,
} = {}) {
  if (!customerId) {
    return {
      success: false,
      statusCode: 400,
      message: "customerId is required",
    };
  }

  if (!discountCode) {
    return {
      success: false,
      statusCode: 400,
      message: "discountCode is required",
    };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, statusCode: 400, message: "items is required" };
  }

  // Resolve variants without reserving stock.
  const variantIds = Array.from(
    new Set(items.map((i) => String(i.variantId || "")).filter(Boolean)),
  );

  const variants = await Variant.find({
    _id: { $in: variantIds },
    status: "active",
  })
    .select(
      "product name sku price stockQuantity reservedQuantity stripeProductId",
    )
    .lean();

  const variantById = new Map(variants.map((v) => [String(v._id), v]));

  const resolvedItems = [];

  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { success: false, statusCode: 400, message: "Invalid quantity" };
    }

    const v = variantById.get(String(item.variantId));
    if (!v) {
      return { success: false, statusCode: 400, message: "Invalid variant" };
    }

    const available =
      Number(v.stockQuantity || 0) - Number(v.reservedQuantity || 0);
    if (available < quantity) {
      return {
        success: false,
        statusCode: 400,
        message: "Not enough stock available",
      };
    }

    const price = Number(v.price || 0);
    const lineSubtotal = price * quantity;

    resolvedItems.push({
      product: v.product,
      variant: v._id,
      name: v.name,
      sku: v.sku,
      price,
      stripeProductId: v.stripeProductId,
      quantity,
      subtotal: lineSubtotal,
    });
  }

  const result = await validateDiscountForOrder({
    code: discountCode,
    customerId,
    resolvedItems,
  });

  if (!result.success) return result;

  const discount = result.data.discount;

  // Public response: do not leak Stripe IDs.
  return {
    success: true,
    data: {
      isValid: true,
      discount: {
        _id: discount._id,
        name: discount.name,
        code: discount.code,
        kind: discount.kind,
        percentOff: discount.percentOff,
        amountOff: discount.amountOff,
        currency: discount.currency,
        scope: discount.scope,
        category: discount.category,
        variantIds: discount.variantIds,
      },
      eligibleSubtotal: result.data.eligibleSubtotal,
      discountAmount: result.data.discountAmount,
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

async function listActiveDiscounts({ page = 1, pageSize = 50 } = {}) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(100, Math.floor(pageSize))
      : 50;

  // Keep DB state consistent: expired discounts should not remain active.
  const nowDate = new Date();
  await Discount.updateMany(
    { isActive: true, endsAt: { $lt: nowDate } },
    { $set: { isActive: false } },
  );

  const now = new Date();
  const filter = {
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      {
        $or: [
          { stripePromotionCodeId: { $exists: true, $ne: null, $ne: "" } },
          { stripeCouponId: { $exists: true, $ne: null, $ne: "" } },
        ],
      },
    ],
  };

  const skip = (safePage - 1) * safePageSize;

  const [total, discounts] = await Promise.all([
    Discount.countDocuments(filter),
    Discount.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safePageSize)
      .select(
        "code scope variantIds kind percentOff amountOff currency category",
      )
      .lean(),
  ]);

  const variantIdSet = new Set();
  for (const d of discounts) {
    if (d.scope === "variant" && Array.isArray(d.variantIds)) {
      for (const id of d.variantIds) variantIdSet.add(String(id));
    }
  }

  const variantIds = Array.from(variantIdSet);
  const variants =
    variantIds.length > 0
      ? await Variant.find({
          _id: { $in: variantIds },
          status: { $ne: "archived" },
        })
          .select("name")
          .lean()
      : [];

  const variantNameById = new Map(
    variants.map((v) => [String(v._id), String(v.name || "")]),
  );

  const items = discounts.map((d) => ({
    code: d.code,
    kind: d.kind,
    percentOff: d.kind === "percent" ? d.percentOff : undefined,
    amountOff: d.kind === "amount" ? d.amountOff : undefined,
    variants:
      d.scope === "variant" && Array.isArray(d.variantIds)
        ? d.variantIds
            .map((id) => variantNameById.get(String(id)))
            .filter(Boolean)
        : [],
  }));

  return {
    success: true,
    data: { items },
    meta: {
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    },
  };
}

module.exports = {
  validateDiscountForOrder,
  validateDiscountForCart,
  listActiveDiscounts,
  recordRedemption,
};
