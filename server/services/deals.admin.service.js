const Deal = require("../models/deal.model");
const Variant = require("../models/variant.model");

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function normalizeItems(items = []) {
  const seen = new Set();
  return items.map((item) => {
    const variantId = String(item.variantId || "");
    if (!variantId || seen.has(variantId)) {
      throw new Error(
        seen.has(variantId)
          ? "Each variant can only appear once in a deal"
          : "Invalid variant",
      );
    }
    seen.add(variantId);
    return {
      variantId,
      quantity: Number(item.quantity),
    };
  });
}

async function resolveItems(items) {
  let normalized;
  try {
    normalized = normalizeItems(items);
  } catch (err) {
    return { success: false, statusCode: 400, message: err.message };
  }

  const ids = normalized.map((item) => item.variantId);
  const variants = await Variant.find({
    _id: { $in: ids },
    status: "active",
  })
    .populate({
      path: "product",
      select: "name status thumbnailImage category",
      populate: {
        path: "thumbnailImage",
        select: "url",
      },
    })
    .populate({
      path: "thumbnailImage",
      select: "url",
    })
    .select(
      "product name sku price stockQuantity reservedQuantity status thumbnailImage",
    )
    .lean();

  if (variants.length !== ids.length) {
    return {
      success: false,
      statusCode: 400,
      message: "One or more selected variants are unavailable",
    };
  }

  const byId = new Map(variants.map((variant) => [String(variant._id), variant]));
  const resolved = [];
  let originalValue = 0;
  let maxPackages = Infinity;

  for (const item of normalized) {
    const variant = byId.get(item.variantId);
    if (!variant || !variant.product || variant.product.status !== "active") {
      return {
        success: false,
        statusCode: 400,
        message: "One or more selected products are unavailable",
      };
    }

    const available = Math.max(
      0,
      Number(variant.stockQuantity || 0) - Number(variant.reservedQuantity || 0),
    );
    maxPackages = Math.min(
      maxPackages,
      Math.floor(available / Number(item.quantity || 1)),
    );
    originalValue += Number(variant.price || 0) * item.quantity;

    resolved.push({
      variant: variant._id,
      quantity: item.quantity,
      details: variant,
    });
  }

  return {
    success: true,
    data: {
      items: resolved.map((item) => ({
        variant: item.variant,
        quantity: item.quantity,
      })),
      itemDetails: resolved,
      originalValue: Number(originalValue.toFixed(2)),
      maxPackages: Number.isFinite(maxPackages) ? maxPackages : 0,
    },
  };
}

function mapDeal(deal, resolution) {
  const originalValue = resolution?.originalValue ?? 0;
  const packagePrice = Number(deal.packagePrice || 0);
  const savings = Math.max(0, originalValue - packagePrice);
  const savingsPercent =
    originalValue > 0 ? Math.round((savings / originalValue) * 100) : 0;

  const detailById = new Map(
    (resolution?.itemDetails || []).map((item) => [
      String(item.variant),
      item.details,
    ]),
  );

  return {
    ...deal,
    originalValue,
    savings: Number(savings.toFixed(2)),
    savingsPercent,
    maxPackages: resolution?.maxPackages ?? 0,
    items: (deal.items || []).map((item) => {
      const variant = detailById.get(String(item.variant));
      return {
        variantId: String(item.variant),
        quantity: item.quantity,
        variant: variant
          ? {
              _id: variant._id,
              name: variant.name,
              sku: variant.sku,
              price: variant.price,
              stockQuantity: variant.stockQuantity,
              reservedQuantity: variant.reservedQuantity || 0,
              thumbnailImage: variant.thumbnailImage || null,
            }
          : null,
        product: variant?.product
          ? {
              _id: variant.product._id,
              name: variant.product.name,
              category: variant.product.category,
              thumbnailImage: variant.product.thumbnailImage || null,
            }
          : null,
      };
    }),
  };
}

async function createDeal({ body, userId }) {
  const slug = slugify(body.slug || body.name);
  if (!slug) {
    return { success: false, statusCode: 400, message: "Invalid deal name" };
  }

  if (body.startsAt && body.endsAt && new Date(body.endsAt) <= new Date(body.startsAt)) {
    return {
      success: false,
      statusCode: 400,
      message: "End date must be after the start date",
    };
  }

  const existing = await Deal.findOne({ slug }).select("_id").lean();
  if (existing) {
    return { success: false, statusCode: 409, message: "Deal slug already exists" };
  }

  const resolution = await resolveItems(body.items);
  if (!resolution.success) return resolution;

  const packagePrice = Number(body.packagePrice);
  if (packagePrice >= resolution.data.originalValue) {
    return {
      success: false,
      statusCode: 400,
      message: "Package price must be lower than the current combined product value",
    };
  }

  const deal = await Deal.create({
    name: body.name,
    slug,
    description: body.description || "",
    imageUrl: body.imageUrl || "",
    items: resolution.data.items,
    packagePrice,
    currency: body.currency || "GBP",
    isActive: body.isActive !== false,
    isFeatured: Boolean(body.isFeatured),
    startsAt: body.startsAt || null,
    endsAt: body.endsAt || null,
    sortOrder: Number(body.sortOrder || 0),
    createdBy: userId || null,
  });

  return {
    success: true,
    data: {
      deal: mapDeal(deal.toObject(), resolution.data),
    },
  };
}

async function listDeals({ page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const skip = (safePage - 1) * safePageSize;

  const [total, deals] = await Promise.all([
    Deal.countDocuments(),
    Deal.find()
      .sort({ isFeatured: -1, sortOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(safePageSize)
      .lean(),
  ]);

  const mapped = [];
  for (const deal of deals) {
    const resolution = await resolveItems(
      (deal.items || []).map((item) => ({
        variantId: String(item.variant),
        quantity: item.quantity,
      })),
    );
    mapped.push(
      mapDeal(
        deal,
        resolution.success
          ? resolution.data
          : { originalValue: 0, maxPackages: 0, itemDetails: [] },
      ),
    );
  }

  return {
    success: true,
    data: { deals: mapped },
    meta: {
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    },
  };
}

async function getDeal({ dealId }) {
  const deal = await Deal.findById(dealId).lean();
  if (!deal) {
    return { success: false, statusCode: 404, message: "Deal not found" };
  }

  const resolution = await resolveItems(
    deal.items.map((item) => ({
      variantId: String(item.variant),
      quantity: item.quantity,
    })),
  );

  return {
    success: true,
    data: {
      deal: mapDeal(
        deal,
        resolution.success
          ? resolution.data
          : { originalValue: 0, maxPackages: 0, itemDetails: [] },
      ),
    },
  };
}

async function updateDeal({ dealId, body }) {
  const current = await Deal.findById(dealId);
  if (!current) {
    return { success: false, statusCode: 404, message: "Deal not found" };
  }

  const nextName = body.name ?? current.name;
  const nextSlug = slugify(body.slug ?? current.slug ?? nextName);
  const nextItems = body.items
    ? body.items
    : current.items.map((item) => ({
        variantId: String(item.variant),
        quantity: item.quantity,
      }));
  const nextPrice =
    body.packagePrice !== undefined
      ? Number(body.packagePrice)
      : Number(current.packagePrice);

  const nextStartsAt =
    body.startsAt !== undefined ? body.startsAt : current.startsAt;
  const nextEndsAt = body.endsAt !== undefined ? body.endsAt : current.endsAt;

  if (
    nextStartsAt &&
    nextEndsAt &&
    new Date(nextEndsAt) <= new Date(nextStartsAt)
  ) {
    return {
      success: false,
      statusCode: 400,
      message: "End date must be after the start date",
    };
  }

  const slugCollision = await Deal.findOne({
    slug: nextSlug,
    _id: { $ne: current._id },
  })
    .select("_id")
    .lean();
  if (slugCollision) {
    return { success: false, statusCode: 409, message: "Deal slug already exists" };
  }

  const resolution = await resolveItems(nextItems);
  if (!resolution.success) return resolution;

  if (nextPrice >= resolution.data.originalValue) {
    return {
      success: false,
      statusCode: 400,
      message: "Package price must be lower than the current combined product value",
    };
  }

  current.name = nextName;
  current.slug = nextSlug;
  current.description =
    body.description !== undefined ? body.description : current.description;
  current.imageUrl = body.imageUrl !== undefined ? body.imageUrl : current.imageUrl;
  current.items = resolution.data.items;
  current.packagePrice = nextPrice;
  current.currency = body.currency ?? current.currency;
  current.isActive = body.isActive ?? current.isActive;
  current.isFeatured = body.isFeatured ?? current.isFeatured;
  current.startsAt = nextStartsAt || null;
  current.endsAt = nextEndsAt || null;
  current.sortOrder =
    body.sortOrder !== undefined ? Number(body.sortOrder) : current.sortOrder;

  await current.save();

  return {
    success: true,
    data: {
      deal: mapDeal(current.toObject(), resolution.data),
    },
  };
}

async function deactivateDeal({ dealId }) {
  const deal = await Deal.findByIdAndUpdate(
    dealId,
    { $set: { isActive: false } },
    { new: true },
  ).lean();

  if (!deal) {
    return { success: false, statusCode: 404, message: "Deal not found" };
  }

  return { success: true, data: { deal } };
}

module.exports = {
  createDeal,
  listDeals,
  getDeal,
  updateDeal,
  deactivateDeal,
};
