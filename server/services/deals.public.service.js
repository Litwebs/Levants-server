const Deal = require("../models/deal.model");

function activeWindowFilter(now = new Date()) {
  return {
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gte: now } }] },
    ],
  };
}

async function populateDeals(query) {
  return query
    .populate({
      path: "items.variant",
      select:
        "product name sku price stockQuantity reservedQuantity status thumbnailImage",
      populate: [
        {
          path: "product",
          select: "name category status thumbnailImage",
          populate: {
            path: "thumbnailImage",
            select: "url",
          },
        },
        {
          path: "thumbnailImage",
          select: "url",
        },
      ],
    })
    .lean();
}

function mapPublicDeal(deal) {
  let originalValue = 0;
  let maxPackages = Infinity;

  const items = [];
  for (const item of deal.items || []) {
    const variant = item.variant;
    const product = variant?.product;

    if (
      !variant ||
      variant.status !== "active" ||
      !product ||
      product.status !== "active"
    ) {
      return null;
    }

    const componentQty = Number(item.quantity || 0);
    const available = Math.max(
      0,
      Number(variant.stockQuantity || 0) -
        Number(variant.reservedQuantity || 0),
    );
    maxPackages = Math.min(
      maxPackages,
      Math.floor(available / Math.max(1, componentQty)),
    );
    originalValue += Number(variant.price || 0) * componentQty;

    items.push({
      variantId: String(variant._id),
      quantity: componentQty,
      variant: {
        id: String(variant._id),
        name: variant.name,
        sku: variant.sku,
        price: Number(variant.price || 0),
        stockQuantity: Number(variant.stockQuantity || 0),
        availableStock: available,
        thumbnailImage: variant.thumbnailImage || null,
      },
      product: {
        id: String(product._id),
        name: product.name,
        category: product.category,
        thumbnailImage: product.thumbnailImage || null,
      },
    });
  }

  if (!Number.isFinite(maxPackages) || maxPackages <= 0) return null;

  const packagePrice = Number(deal.packagePrice || 0);
  const savings = originalValue - packagePrice;

  if (packagePrice <= 0 || savings <= 0) return null;

  const fallbackImage =
    items.find((item) => item.variant.thumbnailImage?.url)?.variant.thumbnailImage
      ?.url ||
    items.find((item) => item.product.thumbnailImage?.url)?.product.thumbnailImage
      ?.url ||
    "";

  return {
    id: String(deal._id),
    name: deal.name,
    slug: deal.slug,
    description: deal.description || "",
    imageUrl: deal.imageUrl || fallbackImage,
    packagePrice: Number(packagePrice.toFixed(2)),
    originalValue: Number(originalValue.toFixed(2)),
    savings: Number(savings.toFixed(2)),
    savingsPercent: Math.round((savings / originalValue) * 100),
    currency: deal.currency || "GBP",
    isFeatured: Boolean(deal.isFeatured),
    startsAt: deal.startsAt || null,
    endsAt: deal.endsAt || null,
    maxPackages,
    items,
  };
}

async function listActiveDeals({ page = 1, pageSize = 24, featured } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 24));
  const filter = activeWindowFilter(new Date());

  if (featured === true || featured === "true") {
    filter.isFeatured = true;
  }

  const rawDeals = await populateDeals(
    Deal.find(filter).sort({ isFeatured: -1, sortOrder: 1, createdAt: -1 }),
  );

  const all = rawDeals.map(mapPublicDeal).filter(Boolean);
  const total = all.length;
  const start = (safePage - 1) * safePageSize;

  return {
    success: true,
    data: { deals: all.slice(start, start + safePageSize) },
    meta: {
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    },
  };
}

async function getActiveDealBySlug({ slug }) {
  const deals = await populateDeals(
    Deal.find({ ...activeWindowFilter(new Date()), slug }).limit(1),
  );
  const deal = deals[0] ? mapPublicDeal(deals[0]) : null;

  if (!deal) {
    return { success: false, statusCode: 404, message: "Deal not found" };
  }

  return { success: true, data: { deal } };
}

async function validateDealsForOrder({ dealClaims, resolvedItems }) {
  const claims = Array.isArray(dealClaims) ? dealClaims : [];
  if (claims.length === 0) {
    return {
      success: true,
      data: { discountAmount: 0, snapshots: [] },
    };
  }

  const normalizedClaims = [];
  const seen = new Set();

  for (const claim of claims) {
    const dealId = String(claim.dealId || "");
    const quantity = Number(claim.quantity);

    if (!dealId || !Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, message: "Invalid deal selection" };
    }
    if (seen.has(dealId)) {
      return { success: false, message: "Duplicate deal selection" };
    }

    seen.add(dealId);
    normalizedClaims.push({ dealId, quantity });
  }

  const dealIds = normalizedClaims.map((claim) => claim.dealId);
  const rawDeals = await Deal.find({
    ...activeWindowFilter(new Date()),
    _id: { $in: dealIds },
  })
    .populate({
      path: "items.variant",
      select: "name price status product",
    })
    .lean();

  if (rawDeals.length !== dealIds.length) {
    return {
      success: false,
      message: "One or more selected deals are no longer available",
    };
  }

  const dealById = new Map(rawDeals.map((deal) => [String(deal._id), deal]));
  const orderQtyByVariant = new Map();
  const orderPriceByVariant = new Map();

  for (const item of resolvedItems || []) {
    const key = String(item.variant);
    orderQtyByVariant.set(
      key,
      (orderQtyByVariant.get(key) || 0) + Number(item.quantity || 0),
    );
    orderPriceByVariant.set(key, Number(item.price || 0));
  }

  const requiredQtyByVariant = new Map();
  const snapshots = [];
  let discountAmount = 0;

  for (const claim of normalizedClaims) {
    const deal = dealById.get(claim.dealId);
    if (!deal) {
      return { success: false, message: "Deal is no longer available" };
    }

    let originalValuePerPackage = 0;
    for (const component of deal.items || []) {
      const variantId = String(component.variant?._id || component.variant || "");
      const quantityPerPackage = Number(component.quantity || 0);
      const livePrice = orderPriceByVariant.get(variantId);

      if (
        !variantId ||
        !quantityPerPackage ||
        typeof livePrice !== "number" ||
        component.variant?.status !== "active"
      ) {
        return {
          success: false,
          message: "A product in this deal is no longer available",
        };
      }

      const required = quantityPerPackage * claim.quantity;
      requiredQtyByVariant.set(
        variantId,
        (requiredQtyByVariant.get(variantId) || 0) + required,
      );
      originalValuePerPackage += livePrice * quantityPerPackage;
    }

    const packagePrice = Number(deal.packagePrice || 0);
    if (packagePrice <= 0 || packagePrice >= originalValuePerPackage) {
      return {
        success: false,
        message: "This deal price is no longer valid",
      };
    }

    const savingPerPackage = originalValuePerPackage - packagePrice;
    discountAmount += savingPerPackage * claim.quantity;

    snapshots.push({
      dealId: String(deal._id),
      name: deal.name,
      slug: deal.slug,
      quantity: claim.quantity,
      packagePrice: Number(packagePrice.toFixed(2)),
      originalValue: Number(originalValuePerPackage.toFixed(2)),
      saving: Number(savingPerPackage.toFixed(2)),
    });
  }

  for (const [variantId, requiredQty] of requiredQtyByVariant.entries()) {
    const orderedQty = orderQtyByVariant.get(variantId) || 0;
    if (requiredQty > orderedQty) {
      return {
        success: false,
        message: "Deal contents do not match the order",
      };
    }
  }

  return {
    success: true,
    data: {
      discountAmount: Number(discountAmount.toFixed(2)),
      snapshots,
    },
  };
}

module.exports = {
  listActiveDeals,
  getActiveDealBySlug,
  validateDealsForOrder,
};
