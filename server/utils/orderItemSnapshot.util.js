"use strict";

const mongoose = require("mongoose");
const Product = require("../models/product.model");

const normalizeProductId = (value) => {
  const raw = value?._id || value;
  if (!raw || !mongoose.Types.ObjectId.isValid(String(raw))) return null;
  return String(raw);
};

async function getProductNameMap(productIds = [], { session } = {}) {
  const ids = [
    ...new Set(
      (Array.isArray(productIds) ? productIds : [])
        .map(normalizeProductId)
        .filter(Boolean),
    ),
  ];

  if (ids.length === 0) return new Map();

  let query = Product.find({ _id: { $in: ids } }).select("_id name").lean();
  if (session) query = query.session(session);

  const rows = await query;
  return new Map((rows || []).map((row) => [String(row._id), row.name]));
}

async function attachProductNameSnapshots(items = [], { session } = {}) {
  if (!Array.isArray(items) || items.length === 0) return items;

  const nameMap = await getProductNameMap(
    items.map((item) => item?.product),
    { session },
  );

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.productName === "string" && item.productName.trim()) continue;

    const productId = normalizeProductId(item.product);
    item.productName = productId ? nameMap.get(productId) || null : null;
  }

  return items;
}

module.exports = {
  getProductNameMap,
  attachProductNameSnapshots,
};
