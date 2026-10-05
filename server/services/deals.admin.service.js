const sharp = require("sharp");
const File = require("../models/file.model");
const Deal = require("../models/deal.model");
const Variant = require("../models/variant.model");
const base64ToTempFile = require("../utils/base64ToTempFile.util");
const {
  uploadAndCreateFile,
  deleteFileIfOrphaned,
} = require("./files.service");

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

async function resolveImage(imageValue, userId) {
  if (imageValue === null || imageValue === "") return null;
  if (!imageValue) return undefined;

  if (typeof imageValue === "string" && imageValue.startsWith("data:")) {
    const match = imageValue.match(
      /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
    );
    if (!match)
      throw Object.assign(new Error("Choose a JPG, PNG or WEBP image"), {
        statusCode: 400,
      });
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 5 * 1024 * 1024)
      throw Object.assign(new Error("Deal images must be 5 MB or smaller"), {
        statusCode: 400,
      });
    try {
      const metadata = await sharp(buffer, {
        limitInputPixels: 40_000_000,
      }).metadata();
      if (
        !["jpeg", "png", "webp"].includes(metadata.format) ||
        metadata.format !== match[1] ||
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > 40_000_000
      ) {
        throw new Error("Unsupported image content");
      }
    } catch {
      throw Object.assign(new Error("The deal image could not be read"), {
        statusCode: 400,
      });
    }
    const tmp = await base64ToTempFile(imageValue);
    const uploaded = await uploadAndCreateFile({
      ...tmp,
      uploadedBy: userId,
      folder: "litwebs/deals",
    });

    if (!uploaded.success) {
      throw new Error(uploaded.message || "Failed to upload deal image");
    }
    return uploaded.data._id;
  }

  const file = await File.findOne({
    _id: imageValue,
    isArchived: false,
  }).lean();
  if (
    !file ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.mimeType)
  ) {
    throw Object.assign(new Error("Deal image is unavailable"), {
      statusCode: 400,
    });
  }
  return file._id;
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

  const byId = new Map(
    variants.map((variant) => [String(variant._id), variant]),
  );
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
      Number(variant.stockQuantity || 0) -
        Number(variant.reservedQuantity || 0),
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

  if (
    body.startsAt &&
    body.endsAt &&
    new Date(body.endsAt) <= new Date(body.startsAt)
  ) {
    return {
      success: false,
      statusCode: 400,
      message: "End date must be after the start date",
    };
  }

  const existing = await Deal.findOne({ slug }).select("_id").lean();
  if (existing) {
    return {
      success: false,
      statusCode: 409,
      message: "Deal slug already exists",
    };
  }

  const resolution = await resolveItems(body.items);
  if (!resolution.success) return resolution;

  const packagePrice = Number(body.packagePrice);
  if (packagePrice >= resolution.data.originalValue) {
    return {
      success: false,
      statusCode: 400,
      message:
        "Package price must be lower than the current combined product value",
    };
  }

  let imageId;
  try {
    imageId = await resolveImage(body.image, userId);
  } catch (err) {
    return {
      success: false,
      statusCode: err.statusCode || 500,
      message: err.statusCode ? err.message : "Failed to upload deal image",
    };
  }

  let deal;
  try {
    deal = await Deal.create({
      name: body.name,
      slug,
      description: body.description || "",
      image: imageId ?? null,
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
  } catch (err) {
    if (imageId && String(body.image || "").startsWith("data:"))
      await deleteFileIfOrphaned(imageId).catch(() => {});
    if (err.code === 11000)
      return {
        success: false,
        statusCode: 409,
        message: "Deal slug already exists",
      };
    throw err;
  }

  const populatedDeal = await Deal.findById(deal._id).populate("image").lean();

  return {
    success: true,
    data: {
      deal: mapDeal(populatedDeal, resolution.data),
    },
  };
}

async function listDeals({ page = 1, pageSize = 20, featured } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const skip = (safePage - 1) * safePageSize;
  const filter =
    featured === true || featured === "true"
      ? { isFeatured: true }
      : featured === false || featured === "false"
        ? { isFeatured: false }
        : {};

  const [total, deals] = await Promise.all([
    Deal.countDocuments(filter),
    Deal.find(filter)
      .populate("image")
      .sort({ isFeatured: -1, sortOrder: 1, createdAt: -1, _id: -1 })
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
  const deal = await Deal.findById(dealId).populate("image").lean();
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

async function updateDeal({ dealId, body, userId }) {
  const current = await Deal.findById(dealId);
  if (!current) {
    return { success: false, statusCode: 404, message: "Deal not found" };
  }
  if (current.archivedAt) {
    return {
      success: false,
      statusCode: 409,
      message: "Archived deals cannot be modified",
    };
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
    return {
      success: false,
      statusCode: 409,
      message: "Deal slug already exists",
    };
  }

  const resolution = await resolveItems(nextItems);
  if (!resolution.success) return resolution;

  if (nextPrice >= resolution.data.originalValue) {
    return {
      success: false,
      statusCode: 400,
      message:
        "Package price must be lower than the current combined product value",
    };
  }

  current.name = nextName;
  current.slug = nextSlug;
  current.description =
    body.description !== undefined ? body.description : current.description;

  let previousImageId = null;
  if (Object.prototype.hasOwnProperty.call(body, "image")) {
    previousImageId = current.image ? String(current.image) : null;
    try {
      const imageId = await resolveImage(
        body.image,
        userId || current.createdBy,
      );
      current.image = imageId ?? null;
    } catch (err) {
      return {
        success: false,
        statusCode: err.statusCode || 500,
        message: err.statusCode ? err.message : "Failed to upload deal image",
      };
    }
  }

  current.items = resolution.data.items;
  current.packagePrice = nextPrice;
  current.currency = body.currency ?? current.currency;
  current.isActive = body.isActive ?? current.isActive;
  current.isFeatured = body.isFeatured ?? current.isFeatured;
  current.startsAt = nextStartsAt || null;
  current.endsAt = nextEndsAt || null;
  current.sortOrder =
    body.sortOrder !== undefined ? Number(body.sortOrder) : current.sortOrder;

  try {
    await current.save();
  } catch (err) {
    if (String(body.image || "").startsWith("data:") && current.image)
      await deleteFileIfOrphaned(current.image).catch(() => {});
    if (err.code === 11000 || err.name === "VersionError")
      return {
        success: false,
        statusCode: 409,
        message: "This deal changed. Refresh and try again.",
      };
    throw err;
  }

  if (previousImageId && previousImageId !== String(current.image || "")) {
    try {
      await deleteFileIfOrphaned(previousImageId);
    } catch {
      // Image cleanup is best-effort and must not fail a valid deal update.
    }
  }

  const populated = await Deal.findById(current._id).populate("image").lean();

  return {
    success: true,
    data: {
      deal: mapDeal(populated, resolution.data),
    },
  };
}

async function deactivateDeal({ dealId }) {
  const deal = await Deal.findById(dealId);
  if (!deal) {
    return { success: false, statusCode: 404, message: "Deal not found" };
  }
  if (deal.archivedAt) {
    return {
      success: false,
      statusCode: 409,
      message: "Archived deals cannot be modified",
    };
  }

  deal.isActive = false;
  try {
    await deal.save();
  } catch (err) {
    if (err.name === "VersionError")
      return {
        success: false,
        statusCode: 409,
        message: "This deal changed. Refresh and try again.",
      };
    throw err;
  }
  return { success: true, data: { deal: deal.toObject() } };
}

async function archiveDeal({ dealId }) {
  const deal = await Deal.findById(dealId);
  if (!deal) {
    return { success: false, statusCode: 404, message: "Deal not found" };
  }

  if (!deal.archivedAt) {
    deal.archivedAt = new Date();
    deal.isActive = false;
    deal.isFeatured = false;
    try {
      await deal.save();
    } catch (err) {
      if (err.name === "VersionError")
        return {
          success: false,
          statusCode: 409,
          message: "This deal changed. Refresh and try again.",
        };
      throw err;
    }
  }

  return { success: true, data: { deal: deal.toObject() } };
}

module.exports = {
  createDeal,
  listDeals,
  getDeal,
  updateDeal,
  deactivateDeal,
  archiveDeal,
};
