// Reusable MongoDB aggregation pipeline stages for stock-level queries.
// Used by both count aggregations in GetSummary and the full detail
// queries in GetLowStock / GetOutOfStock.

const STOCK_AVAILABLE_ADD_FIELDS = {
  $addFields: {
    available: {
      $subtract: [
        {
          $convert: {
            input: "$stockQuantity",
            to: "double",
            onError: 0,
            onNull: 0,
          },
        },
        {
          $convert: {
            input: "$reservedQuantity",
            to: "double",
            onError: 0,
            onNull: 0,
          },
        },
      ],
    },
  },
};

// available > 0 AND available <= lowStockAlert
const LOW_STOCK_MATCH = {
  $match: {
    $expr: {
      $and: [
        { $gt: ["$available", 0] },
        {
          $lte: [
            "$available",
            {
              $convert: {
                input: "$lowStockAlert",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          ],
        },
      ],
    },
  },
};

// available <= 0
const OUT_OF_STOCK_MATCH = {
  $match: {
    $expr: { $lte: ["$available", 0] },
  },
};

const STOCK_PRODUCT_LOOKUP = {
  $lookup: {
    from: "products",
    localField: "product",
    foreignField: "_id",
    as: "product",
  },
};

const STOCK_PRODUCT_UNWIND = {
  $unwind: {
    path: "$product",
    preserveNullAndEmptyArrays: true,
  },
};

// Safety: prevent duplicates if joins ever multiply documents
const STOCK_DEDUP_STAGES = [
  { $group: { _id: "$_id", doc: { $first: "$$ROOT" } } },
  { $replaceRoot: { newRoot: "$doc" } },
];

const STOCK_ITEM_PROJECT = {
  $project: {
    _id: 1,
    sku: 1,
    name: 1,
    stockQuantity: 1,
    reservedQuantity: 1,
    lowStockAlert: 1,
    available: 1,
    product: {
      _id: "$product._id",
      name: "$product.name",
      status: "$product.status",
    },
  },
};

module.exports = {
  STOCK_AVAILABLE_ADD_FIELDS,
  LOW_STOCK_MATCH,
  OUT_OF_STOCK_MATCH,
  STOCK_PRODUCT_LOOKUP,
  STOCK_PRODUCT_UNWIND,
  STOCK_DEDUP_STAGES,
  STOCK_ITEM_PROJECT,
};
