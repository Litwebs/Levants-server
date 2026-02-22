const Role = require("../models/role.model");
const User = require("../models/user.model");
const Variant = require("../models/variant.model");
const sendEmail = require("../Integration/Email.service");
const { FRONTEND_URL } = require("../config/env");

function normalizeBaseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");

  if (process.env.NODE_ENV !== "production") {
    return `http://${value.replace(/\/$/, "")}`;
  }

  return value.replace(/\/$/, "");
}

function buildDashboardUrl() {
  return normalizeBaseUrl(FRONTEND_URL);
}

async function findRecipientUsersForInventoryAlerts() {
  const permissions = ["*", "products.read", "products.*"];

  const roles = await Role.find({ permissions: { $in: permissions } })
    .select("_id")
    .lean();

  const roleIds = roles.map((r) => r._id);
  if (roleIds.length === 0) return [];

  return User.find({
    role: { $in: roleIds },
    status: "active",
    $or: [
      { "preferences.notifications.lowStockAlerts": true },
      { "preferences.notifications.outOfStock": true },
    ],
  })
    .select(
      "email preferences.notifications.lowStockAlerts preferences.notifications.outOfStock",
    )
    .lean();
}

function computeInventoryState({ available, threshold }) {
  const a = Number(available || 0);
  const t = Number(threshold || 0);

  if (a <= 0) return "out";
  if (t > 0 && a <= t) return "low";
  return "ok";
}

async function processInventoryAlertsForVariants({
  variantIds,
  lastKnownStockByVariantId = {},
} = {}) {
  const ids = Array.from(
    new Set((variantIds || []).map(String).filter(Boolean)),
  );
  if (ids.length === 0) return { success: true, data: { processed: 0 } };

  const recipients = await findRecipientUsersForInventoryAlerts();
  const emailsForLowStock = recipients
    .filter((u) => u?.preferences?.notifications?.lowStockAlerts === true)
    .map((u) => String(u.email || "").trim())
    .filter(Boolean);

  const emailsForOutOfStock = recipients
    .filter((u) => u?.preferences?.notifications?.outOfStock === true)
    .map((u) => String(u.email || "").trim())
    .filter(Boolean);

  if (emailsForLowStock.length === 0 && emailsForOutOfStock.length === 0) {
    return { success: true, data: { processed: 0, sent: 0 } };
  }

  const variants = await Variant.find({ _id: { $in: ids } })
    .select(
      "product name sku stockQuantity reservedQuantity lowStockAlert status inventoryAlerts",
    )
    .populate({ path: "product", select: "name" })
    .lean();

  const dashboardUrl = buildDashboardUrl() || undefined;

  let sent = 0;
  let processed = 0;

  for (const v of variants) {
    if (!v || v.status !== "active") continue;

    const stockQuantity = Number(v.stockQuantity || 0);
    const reservedQuantity = Number(v.reservedQuantity || 0);
    const available = stockQuantity - reservedQuantity;

    const threshold = Number(v.lowStockAlert || 0);

    const prevState = String(v.inventoryAlerts?.state || "ok");
    const nextState = computeInventoryState({ available, threshold });

    if (nextState === prevState) continue;

    processed += 1;

    const productName =
      v.product && typeof v.product === "object" ? v.product.name : "";
    const displayName = productName
      ? `${productName} – ${v.name}`
      : String(v.name || "");

    if (nextState === "low") {
      if (emailsForLowStock.length === 0) {
        await Variant.updateOne(
          { _id: v._id },
          {
            $set: {
              "inventoryAlerts.state": "low",
              "inventoryAlerts.lowStockNotifiedAt": new Date(),
            },
          },
        );
        continue;
      }

      const subject = `Low Stock Alert${v.sku ? ` – ${v.sku}` : ""}`;

      const params = {
        productName: displayName,
        sku: v.sku,
        currentStock: available,
        threshold,
        dashboardUrl,
      };

      // Send once with BCC to avoid provider rate limits.
      let result;
      if (emailsForLowStock.length === 1) {
        result = await sendEmail(
          emailsForLowStock[0],
          subject,
          "lowStockAlert",
          params,
        );
      } else {
        result = await sendEmail(
          emailsForLowStock[0],
          subject,
          "lowStockAlert",
          params,
          { bcc: emailsForLowStock.slice(1) },
        );
      }

      if (result && result.success) sent += emailsForLowStock.length;

      await Variant.updateOne(
        { _id: v._id },
        {
          $set: {
            "inventoryAlerts.state": "low",
            "inventoryAlerts.lowStockNotifiedAt": new Date(),
          },
        },
      );
    } else if (nextState === "out") {
      if (emailsForOutOfStock.length === 0) {
        await Variant.updateOne(
          { _id: v._id },
          {
            $set: {
              "inventoryAlerts.state": "out",
              "inventoryAlerts.outOfStockNotifiedAt": new Date(),
            },
          },
        );
        continue;
      }

      const subject = `Out of Stock${v.sku ? ` – ${v.sku}` : ""}`;

      const lastKnown = Number(
        lastKnownStockByVariantId[String(v._id)] ?? available,
      );

      const params = {
        productName: displayName,
        sku: v.sku,
        lastKnownStock: Number.isFinite(lastKnown) ? lastKnown : 0,
        dashboardUrl,
      };

      // Send once with BCC to avoid provider rate limits.
      let result;
      if (emailsForOutOfStock.length === 1) {
        result = await sendEmail(
          emailsForOutOfStock[0],
          subject,
          "outOfStockAlert",
          params,
        );
      } else {
        result = await sendEmail(
          emailsForOutOfStock[0],
          subject,
          "outOfStockAlert",
          params,
          { bcc: emailsForOutOfStock.slice(1) },
        );
      }

      if (result && result.success) sent += emailsForOutOfStock.length;

      await Variant.updateOne(
        { _id: v._id },
        {
          $set: {
            "inventoryAlerts.state": "out",
            "inventoryAlerts.outOfStockNotifiedAt": new Date(),
          },
        },
      );
    } else {
      // Transition back to ok; don't send emails.
      await Variant.updateOne(
        { _id: v._id },
        { $set: { "inventoryAlerts.state": "ok" } },
      );
    }
  }

  return { success: true, data: { processed, sent } };
}

module.exports = {
  processInventoryAlertsForVariants,
};
