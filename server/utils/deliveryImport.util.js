"use strict";

const { normalizeKey } = require("./ordersSpreadsheet.util");

const sanitizeSku = (raw) => {
  if (typeof raw !== "string") return "";
  let s = raw.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  s = s.replace(/^['"`]+|['"`]+$/g, "");
  s = s.replace(/[.]+$/g, "");
  return s.trim();
};

const parseSkuQtyList = (cell) => {
  if (typeof cell !== "string") return [];
  const raw = cell.trim();
  if (!raw) return [];

  const parts = raw
    .split(/[\n,;|]+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const items = [];
  for (const partRaw of parts) {
    const m = partRaw.match(/^\s*(\d+)\s*[xX]\s*(.+)\s*$/);
    if (m) {
      const qty = Number(m[1]);
      const sku = sanitizeSku(
        String(m[2] || "")
          .trim()
          .split(/\s+/g)[0],
      );
      if (sku && Number.isFinite(qty) && qty > 0) items.push({ sku, qty });
      continue;
    }
    const sku = sanitizeSku(partRaw.trim().split(/\s+/g)[0]);
    if (sku) items.push({ sku, qty: 1 });
  }

  const map = new Map();
  for (const it of items) {
    const key = String(it.sku).toLowerCase();
    map.set(key, { sku: it.sku, qty: (map.get(key)?.qty || 0) + it.qty });
  }
  return Array.from(map.values());
};

const parseMoney = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v || "").replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const parsePaidFlag = (v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number" && Number.isFinite(v)) return v > 0;

  const s = String(v || "")
    .trim()
    .toLowerCase();

  if (!s) return null;

  if (["1", "y", "yes", "true", "paid"].includes(s)) return true;
  if (["0", "n", "no", "false", "unpaid", "pending"].includes(s)) return false;

  return null;
};

const generateOrderId = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${date}-${random}`;
};

const splitName = (n) => {
  const s = String(n || "").trim();
  if (!s) return { firstName: "Manual", lastName: "Customer" };
  const parts = s.split(/\s+/g).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: "Customer" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};

const isUkPostcode = (v) => {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  if (!s) return false;
  const compact = s.replace(/\s+/g, "");
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact);
};

const inferPostcodeFromRow = (obj) => {
  if (!obj || typeof obj !== "object") return "";
  for (const v of Object.values(obj)) {
    if (isUkPostcode(v)) return String(v).trim();
  }
  return "";
};

const inferOrderCellFromRow = (obj) => {
  if (!obj || typeof obj !== "object") return "";
  const values = Object.values(obj)
    .map((v) =>
      typeof v === "string" || typeof v === "number" ? String(v).trim() : "",
    )
    .filter(Boolean);

  let best = "";
  let bestScore = 0;
  for (const val of values) {
    const qtyMatches = (val.match(/\b\d+\s*[xX]\s*[^,;|\n]+/g) || []).length;
    const hasSeparators = /[\n,;|]/.test(val) ? 1 : 0;
    const tokenish = (val.match(/[A-Za-z0-9][A-Za-z0-9_-]{2,}/g) || []).length;
    const score = qtyMatches * 10 + hasSeparators * 2 + tokenish;
    if (score > bestScore) {
      bestScore = score;
      best = val;
    }
  }

  if (bestScore >= 10) return best;

  // Multi-SKU lists without quantities.
  for (const val of values) {
    const parts = val
      .split(/[\n,;|]+/g)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) continue;
    const ok = parts.every((p) => {
      const stripped = p.replace(/^\s*\d+\s*[xX]\s*/g, "").trim();
      if (!stripped) return false;
      if (isUkPostcode(stripped)) return false;
      return /^[A-Za-z0-9][A-Za-z0-9_-]{2,}$/.test(stripped);
    });
    if (ok) return val;
  }

  return "";
};

const inferAddressFromRow = (obj) => {
  if (!obj || typeof obj !== "object") return "";
  const values = Object.values(obj)
    .map((v) =>
      typeof v === "string" || typeof v === "number" ? String(v).trim() : "",
    )
    .filter(Boolean);

  const candidates = values.filter((v) => {
    if (isUkPostcode(v)) return false;
    if (/^\+?\d[\d\s()-]{6,}$/.test(v)) return false;
    if (/\b\d+\s*[xX]\b/.test(v)) return false;
    return /\d/.test(v) && /[A-Za-z]/.test(v) && v.length >= 8;
  });

  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || "";
};

const buildManualRow = (obj) => {
  if (!obj || typeof obj !== "object") {
    return {
      name: "",
      email: "",
      address: "",
      postcode: "",
      contact: "",
      orderCell: "",
      deliveryFee: "",
      total: "",
      paid: "",
      _raw: obj,
    };
  }

  const byNorm = new Map(
    Object.entries(obj).map(([k, v]) => [normalizeKey(k), v]),
  );

  const pick = (keys) => {
    for (const k of keys.map(normalizeKey)) {
      if (byNorm.has(k)) return byNorm.get(k);
    }
    return undefined;
  };

  const str = (v) =>
    typeof v === "string" || typeof v === "number" ? String(v).trim() : "";

  const name = str(pick(["name", "customer", "customername"]));
  const email = str(
    pick([
      "email",
      "e-mail",
      "emailaddress",
      "email address",
      "customeremail",
      "customer email",
    ]),
  );
  const address = str(
    pick([
      "address",
      "address1",
      "deliveryaddress",
      "deliveryaddress1",
      "shippingaddress",
      "shippingaddress1",
    ]),
  );
  const postcode = str(
    pick([
      "postcode",
      "post code",
      "post_code",
      "zip",
      "zipcode",
      "postalcode",
    ]),
  );
  const contact = str(pick(["contact", "phone", "telephone", "mobile"]));
  const orderCell = str(
    pick(["order", "orders", "items", "item", "products", "basket", "cart"]),
  );
  const deliveryFee = str(
    pick(["deliveryfee", "delivery fee", "shipping", "delivery"]),
  );
  const total = str(
    pick(["total", "totalamount", "total amount", "amount", "ordertotal"]),
  );
  const paid = str(
    pick([
      "paid",
      "ispaid",
      "payment",
      "paymentstatus",
      "payment status",
      "paidstatus",
    ]),
  );

  return {
    name,
    email,
    address: address || inferAddressFromRow(obj),
    postcode: postcode || inferPostcodeFromRow(obj),
    contact,
    orderCell: orderCell || inferOrderCellFromRow(obj),
    deliveryFee,
    total,
    paid,
    _raw: obj,
  };
};

module.exports = {
  sanitizeSku,
  parseSkuQtyList,
  parseMoney,
  parsePaidFlag,
  generateOrderId,
  splitName,
  isUkPostcode,
  inferPostcodeFromRow,
  inferOrderCellFromRow,
  inferAddressFromRow,
  buildManualRow,
};
