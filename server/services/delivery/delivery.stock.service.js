"use strict";

const mongoose = require("mongoose");
const Order = require("../../models/order.model");
const ProductVariant = require("../../models/variant.model");
const { compareManifestItems } = require("../../utils/manifestItemOrder.util");
const {
  buildManualRow,
  parseSkuQtyList,
} = require("../../utils/deliveryImport.util");

async function getOrdersStockRequirements({ orderIds, ordersSheet } = {}) {
  try {
    const ids = Array.isArray(orderIds)
      ? Array.from(new Set(orderIds.map((id) => String(id))))
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id))
      : [];

    const sheetRows = Array.isArray(ordersSheet?.rows) ? ordersSheet.rows : [];
    const hasSheet = sheetRows.length > 0;

    if (!ids.length && !hasSheet) {
      return {
        success: false,
        statusCode: 400,
        message: "Provide orderIds or upload an ordersFile (xlsx/csv)",
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
    if (ids.length) {
      const orders = await Order.find({ _id: { $in: ids } })
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
