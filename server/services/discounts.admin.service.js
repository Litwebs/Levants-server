const Discount = require("../models/discount.model");
const DiscountRedemption = require("../models/discountRedemption.model");
const Order = require("../models/order.model");
const Variant = require("../models/variant.model");
const Product = require("../models/product.model");
const stripe = require("../utils/stripe.util");

function generateCode() {
  const part = Math.random().toString(36).slice(2, 8).toUpperCase();
  const part2 = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DISC-${part}${part2}`;
}

function toUnixSeconds(date) {
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor(t / 1000);
}

async function resolveStripeProductIdsForScope({
  scope,
  category,
  productIds,
  variantIds,
}) {
  if (scope === "global") return { success: true, stripeProductIds: [] };

  let variants = [];

  if (scope === "variant") {
    variants = await Variant.find({ _id: { $in: variantIds } })
      .select("stripeProductId")
      .lean();
  }

  if (scope === "category") {
    const products = await Product.find({ category }).select("_id").lean();
    const ids = products.map((p) => p._id);
    variants = await Variant.find({ product: { $in: ids } })
      .select("stripeProductId")
      .lean();
  }

  const stripeProductIds = Array.from(
    new Set(variants.map((v) => v.stripeProductId).filter(Boolean)),
  );

  if (stripeProductIds.length === 0) {
    return {
      success: false,
      message:
        "No Stripe products found for the selected scope (ensure variants were created with Stripe IDs)",
    };
  }

  // Stripe has limits; keep this conservative.
  const maxProducts = 200;
  if (stripeProductIds.length > maxProducts) {
    return {
      success: false,
      message: `Too many Stripe products (${stripeProductIds.length}) for a single coupon applies_to. Narrow the scope.`,
    };
  }

  return { success: true, stripeProductIds };
}

async function CreateDiscount({ body, userId }) {
  const code = String(body.code || generateCode())
    .trim()
    .toUpperCase();

  const existing = await Discount.findOne({ code }).select("_id").lean();
  if (existing) {
    return {
      success: false,
      statusCode: 409,
      message: "Discount code already exists",
    };
  }

  const scope = body.scope || "global";

  const resolved = await resolveStripeProductIdsForScope({
    scope,
    category: body.category,
    variantIds: body.variantIds,
  });

  if (!resolved.success) {
    return { success: false, statusCode: 400, message: resolved.message };
  }

  const endsAtUnix = body.endsAt ? toUnixSeconds(body.endsAt) : null;

  const couponPayload = {
    name: body.name,
    duration: "once",
    ...(body.kind === "percent" ? { percent_off: body.percentOff } : {}),
    ...(body.kind === "amount"
      ? {
          amount_off: Math.round(Number(body.amountOff) * 100),
          currency: String(body.currency || "GBP").toLowerCase(),
        }
      : {}),
    ...(Number.isFinite(body.maxRedemptions)
      ? { max_redemptions: body.maxRedemptions }
      : {}),
    ...(endsAtUnix ? { redeem_by: endsAtUnix } : {}),
    metadata: {
      code,
      scope,
      category: body.category || "",
    },
  };

  if (scope !== "global") {
    couponPayload.applies_to = { products: resolved.stripeProductIds };
  }

  const coupon = await stripe.coupons.create(couponPayload);

  const promoPayload = {
    coupon: coupon.id,
    code,
    active: true,
    ...(endsAtUnix ? { expires_at: endsAtUnix } : {}),
    ...(Number.isFinite(body.maxRedemptions)
      ? { max_redemptions: body.maxRedemptions }
      : {}),
    metadata: {
      code,
      discountName: body.name,
    },
  };

  const promotionCode = await stripe.promotionCodes.create(promoPayload);

  const discount = await Discount.create({
    name: body.name,
    code,
    kind: body.kind,
    percentOff: body.kind === "percent" ? body.percentOff : undefined,
    amountOff: body.kind === "amount" ? body.amountOff : undefined,
    currency: body.currency || "GBP",
    scope,
    category: body.category,
    variantIds: body.variantIds || [],
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    maxRedemptions: body.maxRedemptions,
    perCustomerLimit: body.perCustomerLimit,
    stripeCouponId: coupon.id,
    stripePromotionCodeId: promotionCode.id,
    createdBy: userId,
  });

  return { success: true, data: { discount } };
}

async function ListDiscounts({ page = 1, pageSize = 20 } = {}) {
  // Keep DB state consistent: expired discounts should not remain active.
  const now = new Date();
  await Discount.updateMany(
    { isActive: true, endsAt: { $lt: now } },
    { $set: { isActive: false } },
  );

  const skip = (page - 1) * pageSize;

  const [total, discounts] = await Promise.all([
    Discount.countDocuments({}),
    Discount.find({}).sort({ createdAt: -1 }).skip(skip).limit(pageSize),
  ]);

  return {
    success: true,
    data: { discounts },
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

async function GetDiscountDetails({
  discountId,
  page = 1,
  pageSize = 20,
} = {}) {
  const discount = await Discount.findById(discountId).lean();
  if (!discount) {
    return { success: false, statusCode: 404, message: "Discount not found" };
  }

  let variants = [];
  if (
    discount.scope === "variant" &&
    Array.isArray(discount.variantIds) &&
    discount.variantIds.length > 0
  ) {
    const docs = await Variant.find({ _id: { $in: discount.variantIds } })
      .where({ status: { $ne: "archived" } })
      .select("name sku")
      .lean();

    const byId = new Map(docs.map((v) => [String(v._id), v]));
    variants = discount.variantIds
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .map((v) => ({
        _id: v._id,
        name: v.name,
        sku: v.sku,
      }));
  }

  // Ensure expired discounts are marked inactive.
  const now = Date.now();
  if (
    discount.isActive &&
    discount.endsAt &&
    new Date(discount.endsAt).getTime() < now
  ) {
    await Discount.updateOne(
      { _id: discount._id, isActive: true },
      { $set: { isActive: false } },
    );
    discount.isActive = false;
  }

  const skip = (page - 1) * pageSize;

  const [totalRedemptions, uniqueCustomersAgg, redemptions] = await Promise.all(
    [
      DiscountRedemption.countDocuments({ discount: discountId }),
      DiscountRedemption.aggregate([
        { $match: { discount: discount._id } },
        { $group: { _id: "$customer" } },
        { $count: "count" },
      ]),
      DiscountRedemption.find({ discount: discountId })
        .sort({ redeemedAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate({ path: "customer", select: "name email" })
        .lean(),
    ],
  );

  const uniqueCustomers = Number(uniqueCustomersAgg?.[0]?.count || 0);

  const orderIds = redemptions.map((r) => String(r.order)).filter(Boolean);

  const orders = await Order.find({ _id: { $in: orderIds } })
    .select("orderId total status createdAt")
    .lean();

  const orderById = new Map(orders.map((o) => [String(o._id), o]));

  const items = redemptions.map((r) => ({
    _id: r._id,
    redeemedAt: r.redeemedAt,
    customer: r.customer
      ? {
          _id: r.customer._id,
          name: r.customer.name,
          email: r.customer.email,
        }
      : null,
    order: orderById.get(String(r.order))
      ? {
          _id: orderById.get(String(r.order))._id,
          orderId: orderById.get(String(r.order)).orderId,
          total: orderById.get(String(r.order)).total,
          status: orderById.get(String(r.order)).status,
          createdAt: orderById.get(String(r.order)).createdAt,
        }
      : null,
  }));

  return {
    success: true,
    data: {
      discount,
      variants,
      claims: {
        total: totalRedemptions,
        uniqueCustomers,
      },
      redemptions: items,
    },
    meta: {
      total: totalRedemptions,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalRedemptions / pageSize)),
    },
  };
}

async function DeactivateDiscount({ discountId }) {
  const discount = await Discount.findById(discountId);
  if (!discount) {
    return { success: false, statusCode: 404, message: "Discount not found" };
  }

  discount.isActive = false;
  await discount.save();

  // Best-effort: deactivate promotion code in Stripe
  try {
    if (discount.stripePromotionCodeId) {
      await stripe.promotionCodes.update(discount.stripePromotionCodeId, {
        active: false,
      });
    }
  } catch (e) {
    // ignore
  }

  return { success: true, data: { discount } };
}

module.exports = {
  CreateDiscount,
  ListDiscounts,
  GetDiscountDetails,
  DeactivateDiscount,
};
