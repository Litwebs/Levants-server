"use strict";

const mongoose = require("mongoose");
const Order = require("../../models/order.model");
const ProductVariant = require("../../models/variant.model");
const SubscriptionDelivery = require("../../models/subscriptionDelivery.model");
const { compareManifestItems } = require("../../utils/manifestItemOrder.util");
const { toUtcIsoOnBatchDate } = require("../../utils/routeTime.util");
const {
  buildManualRow,
  parseSkuQtyList,
} = require("../../utils/deliveryImport.util");

const DELIVERY_TIME_ZONE =
  process.env.DELIVERY_TIME_ZONE ||
  process.env.BUSINESS_TIME_ZONE ||
  "Europe/London";

const ELIGIBLE_ORDER_STATUSES = [
  "paid",
  "partially_paid",
  "partially_refunded",
];

function getDeliveryDayRange(deliveryDate) {
  const normalized = String(deliveryDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const date = new Date(`${normalized}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;

  // Reject rollover dates such as 2026-02-31.
  if (date.toISOString().slice(0, 10) !== normalized) return null;

  const nextDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  );
  const start = new Date(
    toUtcIsoOnBatchDate(date, "00:00", DELIVERY_TIME_ZONE),
  );
  const end = new Date(
    toUtcIsoOnBatchDate(nextDate, "00:00", DELIVERY_TIME_ZONE),
  );

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

function resolveSubscriptionItemsForDelivery(subscription, scheduledDate) {
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: DELIVERY_TIME_ZONE,
    weekday: "short",
  }).format(new Date(scheduledDate));
  const deliveryWeekday = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
  ].indexOf(weekdayName);
  const dayPlan = Array.isArray(subscription?.deliveryDayPlans)
    ? subscription.deliveryDayPlans.find(
        (plan) => Number(plan?.day) === Number(deliveryWeekday),
      )
    : null;

  return dayPlan?.items?.length ? dayPlan.items : subscription?.items || [];
}

async function getOrdersStockRequirements({
  orderIds,
  ordersSheet,
  orderTypeScope = "both",
  deliveryDate,
} = {}) {
  try {
    const ids = Array.isArray(orderIds)
      ? Array.from(new Set(orderIds.map((id) => String(id))))
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id))
      : [];

    const sheetRows = Array.isArray(ordersSheet?.rows) ? ordersSheet.rows : [];
    const hasSheet = sheetRows.length > 0;

    const normalizedScope = String(orderTypeScope || "both").toLowerCase();
    const scopeToOrderType = {
      normal: "one_time",
      subscription: "subscription_generated",
    };
    const orderTypeFilter = scopeToOrderType[normalizedScope] || null;

    if (!["both", "normal", "subscription"].includes(normalizedScope)) {
      return {
        success: false,
        statusCode: 400,
        message: "orderTypeScope must be both, normal, or subscription",
      };
    }

    const normalizedDeliveryDate = String(deliveryDate || "").trim();
    const deliveryDayRange = normalizedDeliveryDate
      ? getDeliveryDayRange(normalizedDeliveryDate)
      : null;

    if (normalizedDeliveryDate && !deliveryDayRange) {
      return {
        success: false,
        statusCode: 400,
        message: "deliveryDate must be a valid date in YYYY-MM-DD format",
      };
    }

    if (!ids.length && !hasSheet && !deliveryDayRange) {
      return {
        success: false,
        statusCode: 400,
        message:
          "Provide a deliveryDate, orderIds, or upload an ordersFile (xlsx/csv)",
      };
    }

    const aggregationMap = new Map();

    const upsert = ({
      variantId,
      productId,
      sku,
      name,
      unitPrice,
      quantity,
      orderRef,
    }) => {
      const key = String(variantId || "");
      if (!key) return;

      if (!aggregationMap.has(key)) {
        aggregationMap.set(key, {
          variantId,
          productId,
          sku,
          name,
          unitPrice,
          totalQuantity: 0,
          orders: [],
        });
      }

      const entry = aggregationMap.get(key);
      const qty = Number(quantity);
      if (Number.isFinite(qty) && qty > 0) entry.totalQuantity += qty;
      if (orderRef) {
        entry.orders.push({
          orderId: orderRef.orderId,
          orderDbId: orderRef.orderDbId,
          row: orderRef.row,
          quantity: qty,
        });
      }
    };

    let ordersFound = 0;
    if (ids.length || deliveryDayRange) {
      const orderQuery = deliveryDayRange
        ? {
            deliveryDate: {
              $gte: deliveryDayRange.start,
              $lt: deliveryDayRange.end,
            },
            status: { $in: ELIGIBLE_ORDER_STATUSES },
            archived: { $ne: true },
          }
        : { _id: { $in: ids } };
      if (orderTypeFilter) {
        orderQuery.orderType = orderTypeFilter;
      }

      const orders = await Order.find(orderQuery)
        .select("_id orderId items")
        .lean();

      ordersFound = Array.isArray(orders) ? orders.length : 0;

      for (const order of orders || []) {
        const items = Array.isArray(order?.items) ? order.items : [];
        for (const item of items) {
          upsert({
            variantId: item.variant,
            productId: item.product,
            sku: item.sku,
            name: item.name,
            unitPrice: item.price,
            quantity: item.quantity,
            orderRef: {
              orderId: order.orderId,
              orderDbId: String(order._id),
            },
          });
        }
      }
    }

    let scheduledSubscriptionDeliveriesFound = 0;
    if (deliveryDayRange && normalizedScope !== "normal") {
      // Generated slots are represented by their Order above. Only ungenerated
      // slots are expanded here, which prevents recurring items and add-ons
      // from being counted twice.
      const scheduledDeliveries = await SubscriptionDelivery.find({
        scheduledDate: {
          $gte: deliveryDayRange.start,
          $lt: deliveryDayRange.end,
        },
        status: { $in: ["scheduled", "rescheduled"] },
        order: null,
      })
        .populate({
          path: "subscription",
          select: "subscriptionNumber items deliveryDayPlans",
        })
        .lean();

      scheduledSubscriptionDeliveriesFound = Array.isArray(
        scheduledDeliveries,
      )
        ? scheduledDeliveries.length
        : 0;

      for (const delivery of scheduledDeliveries || []) {
        const subscription = delivery?.subscription;
        if (!subscription || typeof subscription !== "object") continue;

        const orderRef = {
          orderId:
            subscription.subscriptionNumber ||
            `subscription-delivery-${String(delivery._id)}`,
          orderDbId: null,
        };

        for (const item of resolveSubscriptionItemsForDelivery(
          subscription,
          delivery.scheduledDate,
        )) {
          upsert({
            variantId: item.variant,
            productId: item.product,
            sku: item.sku,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            orderRef,
          });
        }

        for (const addOn of delivery.addOns || []) {
          for (const item of addOn.items || []) {
            upsert({
              variantId: item.variant,
              productId: item.product,
              sku: item.sku,
              name: item.name,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              orderRef,
            });
          }
        }
      }
    }

    let sheetUsableRows = 0;
    let sheetMissingSkus = [];

    if (hasSheet) {
      const manualRows = sheetRows
        .map(buildManualRow)
        .filter((r) => r && (r.orderCell || r.name || r.postcode || r.address));

      const usable = manualRows.filter((r) => r && r.orderCell);
      sheetUsableRows = usable.length;

      if (usable.length) {
        const allSkuLower = Array.from(
          new Set(
            usable
              .flatMap((r) =>
                parseSkuQtyList(r.orderCell).map((x) =>
                  String(x.sku).toLowerCase(),
                ),
              )
              .filter(Boolean),
          ),
        );

        const variantRows = allSkuLower.length
          ? await ProductVariant.aggregate([
              {
                $project: {
                  _id: 1,
                  product: 1,
                  name: 1,
                  sku: 1,
                  price: 1,
                  status: 1,
                  lowerSku: { $toLower: "$sku" },
                },
              },
              {
                $match: { status: "active", lowerSku: { $in: allSkuLower } },
              },
            ])
          : [];

        const variantsByLowerSku = new Map(
          (variantRows || []).map((v) => [String(v.lowerSku), v]),
        );

        sheetMissingSkus = allSkuLower.filter(
          (skuLower) => !variantsByLowerSku.has(String(skuLower)),
        );

        if (sheetMissingSkus.length) {
          return {
            success: false,
            statusCode: 400,
            message: `Some SKUs from the uploaded sheet do not exist or are inactive: ${sheetMissingSkus
              .slice(0, 10)
              .join(", ")}`,
          };
        }

        for (let i = 0; i < usable.length; i++) {
          const row = usable[i];
          const skuQty = parseSkuQtyList(row.orderCell);
          for (const it of skuQty) {
            const v = variantsByLowerSku.get(String(it.sku).toLowerCase());
            if (!v) continue;
            upsert({
              variantId: v._id,
              productId: v.product,
              sku: v.sku,
              name: v.name,
              unitPrice: Number(v.price) || 0,
              quantity: it.qty,
              orderRef: {
                row: i + 2,
                orderId: row.name ? String(row.name) : `row_${i + 2}`,
                orderDbId: null,
              },
            });
          }
        }
      }
    }

    const aggregatedItems = Array.from(aggregationMap.values())
      .filter((x) => Number(x.totalQuantity) > 0)
      .sort(compareManifestItems);

    return {
      success: true,
      data: {
        sources: {
          orderIdsProvided: ids.length,
          ordersFound,
          orderTypeScope: normalizedScope,
          deliveryDate: normalizedDeliveryDate || null,
          scheduledSubscriptionDeliveriesFound,
          sheet: hasSheet
            ? {
                originalName: ordersSheet?.originalName,
                detectedType: ordersSheet?.detectedType,
                rows: sheetRows.length,
                usableRows: sheetUsableRows,
              }
            : null,
        },
        totalUniqueProducts: aggregatedItems.length,
        items: aggregatedItems,
      },
    };
  } catch (err) {
    console.error("Orders stock requirements error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to calculate stock requirements",
    };
  }
}

module.exports = { getOrdersStockRequirements };
