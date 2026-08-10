"use strict";

const mongoose = require("mongoose");
const Order = require("../../models/order.model");
const ProductVariant = require("../../models/variant.model");
const Customer = require("../../models/customer.model");
const Payment = require("../../models/payment.model");
const CustomerNotification = require("../../models/customerNotification.model");
const { validateDiscountForOrder } = require("../discounts.public.service");
const { geocodeAddress } = require("../../Integration/google.geocode");
const { Response } = require("../../utils/response.util");

const ALLOWED_CANCEL_STATUSES = ["pending", "unpaid"];
const DELIVERY_STATUS_FILTERS = new Set([
  "ordered",
  "dispatched",
  "in_transit",
  "delivered",
  "returned",
]);
const RECEIPT_ELIGIBLE_STATUSES = new Set([
  "paid",
  "partially_paid",
  "partially_refunded",
  "refunded",
]);

/**
 * Place a one-time order for an authenticated portal customer.
 */
async function PlaceOrder({
  customerId,
  items,
  deliveryAddressId,
  discountCode,
  deliveryDate,
  customerInstructions,
} = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return Response(false, "At least one item is required", null);
  }

  // Fetch customer and verify address
  const customer = await Customer.findById(customerId);
  if (!customer) return Response(false, "Customer not found", null);

  const address = customer.addresses.id(deliveryAddressId);
  if (!address) return Response(false, "Delivery address not found", null);

  // Geocode address
  let location;
  try {
    location = await geocodeAddress({
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      postcode: address.postcode,
      country: address.country,
    });
  } catch {
    return Response(
      false,
      "Invalid delivery address – could not geocode",
      null,
    );
  }

  // Resolve variants and build order items
  const variantIds = items.map((i) => new mongoose.Types.ObjectId(i.variantId));
  const variants = await ProductVariant.find({
    _id: { $in: variantIds },
    status: "active",
  }).populate("product", "name status isSubscriptionEligible");

  if (variants.length !== items.length) {
    return Response(false, "One or more products are unavailable", null);
  }

  // Check product availability
  for (const v of variants) {
    if (!v.product || v.product.status !== "active") {
      return Response(false, `Product "${v.name}" is not available`, null);
    }
    if (v.stockQuantity - v.reservedQuantity <= 0) {
      return Response(false, `"${v.name}" is out of stock`, null);
    }
  }

  // Build item map
  const variantMap = new Map(variants.map((v) => [String(v._id), v]));
  let subtotal = 0;
  const orderItems = [];

  for (const item of items) {
    const variant = variantMap.get(String(item.variantId));
    const itemSubtotal = variant.price * item.quantity;
    subtotal += itemSubtotal;
    orderItems.push({
      product: variant.product._id,
      variant: variant._id,
      name: `${variant.product.name} – ${variant.name}`,
      sku: variant.sku,
      price: variant.price,
      quantity: item.quantity,
      subtotal: itemSubtotal,
    });
  }

  // Apply discount
  let discountAmount = 0;
  let discountDoc = null;
  let isDiscounted = false;
  if (discountCode) {
    const discountResult = await validateDiscountForOrder({
      code: discountCode,
      customerId,
      items: orderItems.map((i) => ({
        variantId: String(i.variant),
        subtotal: i.subtotal,
        category: null,
      })),
      subtotal,
    });

    if (discountResult.success) {
      discountDoc = discountResult.data.discount;
      discountAmount = discountResult.data.discountAmount || 0;
      isDiscounted = discountAmount > 0;
    }
  }

  const deliveryFee = 0; // Delivery fee calculated by existing delivery logic if needed
  const totalBeforeDiscount = subtotal + deliveryFee;
  const total = Math.max(0, totalBeforeDiscount - discountAmount);

  const reservationTtlMin = Math.max(
    30,
    Number(process.env.ORDER_RESERVATION_TTL_MINUTES) || 30,
  );
  const reservationExpiresAt = new Date(
    Date.now() + reservationTtlMin * 60 * 1000,
  );

  const order = await Order.create({
    customer: customer._id,
    items: orderItems,
    deliveryAddress: {
      line1: address.line1,
      line2: address.line2 || null,
      city: address.city,
      postcode: address.postcode,
      country: address.country,
    },
    customerInstructions: customerInstructions || "",
    location,
    deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
    deliveryFee,
    subtotal,
    total,
    isDiscounted,
    totalBeforeDiscount: isDiscounted ? totalBeforeDiscount : undefined,
    discountAmount,
    status: "pending",
    deliveryStatus: "ordered",
    orderType: "one_time",
    reservationExpiresAt,
  });

  // Update customer lastOrderAt
  customer.lastOrderAt = new Date();
  await customer.save();

  // Create payment record
  await Payment.create({
    customer: customer._id,
    order: order._id,
    amount: total,
    status: "pending",
  });

  // Create notification
  await CustomerNotification.create({
    customer: customer._id,
    type: "order_placed",
    title: "Order placed",
    message: `Your order #${order.orderId} has been placed successfully.`,
    relatedOrder: order._id,
  });

  return Response(true, "Order placed successfully", { order });
}

/**
 * List orders for a customer.
 */
async function ListOrders({
  customerId,
  page = 1,
  pageSize = 20,
  status,
  search,
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));

  const filter = { customer: customerId, status: { $ne: "pending" } };
  if (status) {
    if (status === "pending") {
      return Response(true, null, {
        orders: [],
        meta: { page: safePage, pageSize: safePageSize, total: 0 },
      });
    }
    if (DELIVERY_STATUS_FILTERS.has(status)) {
      filter.deliveryStatus = status;
    } else {
      filter.status = status;
    }
  }

  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch) {
    const escaped = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [{ orderId: regex }, { "items.name": regex }];
  }

  const total = await Order.countDocuments(filter);
  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .skip((safePage - 1) * safePageSize)
    .limit(safePageSize)
    .lean();

  return Response(true, null, {
    orders,
    meta: { page: safePage, pageSize: safePageSize, total },
  });
}

/**
 * Get a single order for a customer.
 */
async function GetOrder({ customerId, orderId } = {}) {
  const order = await Order.findOne({
    _id: orderId,
    customer: customerId,
    status: { $ne: "pending" },
  })
    .populate("subscription", "subscriptionNumber")
    .populate("customer", "firstName lastName email phone")
    .lean();

  if (!order) return Response(false, "Order not found", null);

  const customerDoc =
    order.customer && typeof order.customer === "object"
      ? order.customer
      : null;

  const normalizedOrder = {
    ...order,
    customer: customerDoc?._id || order.customer,
    customerDetails: customerDoc
      ? {
          firstName: customerDoc.firstName || null,
          lastName: customerDoc.lastName || null,
          email: customerDoc.email || null,
          phone: customerDoc.phone || null,
        }
      : null,
  };

  return Response(true, null, { order: normalizedOrder });
}

/**
 * Get order data required to render a custom receipt template.
 */
async function GetOrderReceiptData({ customerId, orderId } = {}) {
  const order = await Order.findOne({
    _id: orderId,
    customer: customerId,
    status: { $ne: "pending" },
  })
    .populate("customer", "firstName lastName email phone")
    .lean();

  if (!order) return Response(false, "Order not found", null);

  const hasPaymentEvidence =
    Boolean(order.paidAt) || RECEIPT_ELIGIBLE_STATUSES.has(order.status);

  if (!hasPaymentEvidence) {
    return Response(false, "Receipt is not available for this order yet", null);
  }

  const customerDoc =
    order.customer && typeof order.customer === "object"
      ? order.customer
      : null;

  const receiptOrder = {
    ...order,
    customer: customerDoc?._id || order.customer,
    customerDetails: customerDoc
      ? {
          firstName: customerDoc.firstName || null,
          lastName: customerDoc.lastName || null,
          email: customerDoc.email || null,
          phone: customerDoc.phone || null,
        }
      : null,
  };

  return Response(true, null, { order: receiptOrder });
}

/**
 * Get Stripe receipt URL for a customer order.
 */
async function GetOrderReceiptUrl({ customerId, orderId } = {}) {
  const receiptDataResult = await GetOrderReceiptData({ customerId, orderId });
  if (!receiptDataResult.success) {
    return receiptDataResult;
  }

  return Response(true, null, {
    receiptUrl: `/api/portal/orders/${orderId}/receipt/custom`,
  });
}

/**
 * Cancel an order (customer-initiated, limited statuses).
 */
async function CancelOrder({ customerId, orderId, reason } = {}) {
  const order = await Order.findOne({ _id: orderId, customer: customerId });
  if (!order) return Response(false, "Order not found", null);

  if (!ALLOWED_CANCEL_STATUSES.includes(order.status)) {
    return Response(
      false,
      "This order cannot be cancelled at this stage",
      null,
    );
  }

  order.status = "cancelled";
  if (reason)
    order.metadata = { ...(order.metadata || {}), cancelReason: reason };
  await order.save();

  await CustomerNotification.create({
    customer: customerId,
    type: "order_cancelled",
    title: "Order cancelled",
    message: `Your order #${order.orderId} has been cancelled.`,
    relatedOrder: order._id,
  });

  return Response(true, "Order cancelled", { order });
}

/**
 * Reorder – create a new order with the same items.
 */
async function Reorder({ customerId, orderId } = {}) {
  const original = await Order.findOne({ _id: orderId, customer: customerId });
  if (!original) return Response(false, "Order not found", null);

  const customer = await Customer.findById(customerId);
  if (!customer) return Response(false, "Customer not found", null);

  // Find default address
  const defaultAddress =
    customer.addresses.find((a) => a.isDefault) || customer.addresses[0];
  if (!defaultAddress) {
    return Response(
      false,
      "Please add a delivery address before reordering",
      null,
    );
  }

  const items = original.items.map((i) => ({
    variantId: String(i.variant),
    quantity: i.quantity,
  }));

  return PlaceOrder({
    customerId,
    items,
    deliveryAddressId: String(defaultAddress._id),
    customerInstructions: original.customerInstructions,
  });
}

module.exports = {
  PlaceOrder,
  ListOrders,
  GetOrder,
  GetOrderReceiptData,
  GetOrderReceiptUrl,
  CancelOrder,
  Reorder,
};
