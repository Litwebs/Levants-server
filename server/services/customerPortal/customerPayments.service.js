"use strict";

const Payment = require("../../models/payment.model");
const PaymentMethod = require("../../models/paymentMethod.model");
const Order = require("../../models/order.model");
const Customer = require("../../models/customer.model");
const Subscription = require("../../models/subscription.model");
const stripe = require("../../utils/stripe.util");
const { Response } = require("../../utils/response.util");

const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || null;

async function getCustomerWithStripeId(customerId) {
  return Customer.findById(customerId).select(
    "_id email firstName lastName stripeCustomerId",
  );
}

async function ensureStripeCustomer(customerId) {
  const customer = await getCustomerWithStripeId(customerId);
  if (!customer) return null;

  if (customer.stripeCustomerId) return customer;

  const stripeCustomer = await stripe.customers.create({
    email: customer.email || undefined,
    name: `${customer.firstName || ""} ${customer.lastName || ""}`.trim(),
    metadata: {
      customerId: String(customer._id),
    },
  });

  customer.stripeCustomerId = stripeCustomer.id;
  await customer.save();
  return customer;
}

function normalizeStripeCard(paymentMethod) {
  const card = paymentMethod?.card || null;
  if (!card) return {};

  return {
    cardBrand: card.brand || null,
    lastFour: card.last4 || null,
    expiryMonth: card.exp_month || null,
    expiryYear: card.exp_year || null,
  };
}

// ===== Customer-facing =====

async function ListPayments({ customerId, page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));

  const orderFilter = {
    customer: customerId,
    $or: [
      { stripePaymentIntentId: { $exists: true, $ne: null } },
      { stripeCheckoutSessionId: { $exists: true, $ne: null } },
      { paidAt: { $exists: true, $ne: null } },
      {
        status: {
          $in: ["paid", "partially_paid", "partially_refunded", "refunded"],
        },
      },
    ],
  };

  const total = await Order.countDocuments(orderFilter);
  const orders = await Order.find(orderFilter)
    .select(
      "_id orderId status total amountPaid currency paidAt createdAt updatedAt stripePaymentIntentId stripeCheckoutSessionId refunds refund refundedAt failedAt subscription",
    )
    .populate("subscription", "subscriptionNumber")
    .sort({ paidAt: -1, createdAt: -1 })
    .skip((safePage - 1) * safePageSize)
    .limit(safePageSize)
    .lean();

  const toPaymentStatus = (orderStatus, stripeStatus) => {
    if (orderStatus === "refunded" || orderStatus === "partially_refunded") {
      return "refunded";
    }
    if (stripeStatus === "succeeded") return "paid";
    if (
      stripeStatus === "requires_payment_method" ||
      stripeStatus === "canceled"
    ) {
      return "failed";
    }
    if (
      stripeStatus === "requires_confirmation" ||
      stripeStatus === "requires_action" ||
      stripeStatus === "requires_capture" ||
      stripeStatus === "processing"
    ) {
      return "pending";
    }
    if (orderStatus === "paid" || orderStatus === "partially_paid")
      return "paid";
    if (orderStatus === "failed" || orderStatus === "refund_failed")
      return "failed";
    return "pending";
  };

  const payments = await Promise.all(
    orders.map(async (order) => {
      let stripeStatus = null;

      if (order.stripePaymentIntentId) {
        try {
          const intent = await stripe.paymentIntents.retrieve(
            order.stripePaymentIntentId,
          );
          stripeStatus = intent?.status || null;
        } catch {
          stripeStatus = null;
        }
      }

      return {
        _id: `order-${String(order._id)}`,
        amount: Number(order.amountPaid ?? order.total ?? 0),
        currency: order.currency || "GBP",
        status: toPaymentStatus(order.status, stripeStatus),
        providerReference:
          order.stripePaymentIntentId || order.stripeCheckoutSessionId || null,
        paidAt: order.paidAt || null,
        failedAt: null,
        refundedAt:
          order.refunds?.[0]?.refundedAt || order.refund?.refundedAt || null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        order: {
          _id: order._id,
          orderId: order.orderId,
          status: order.status,
          total: order.total,
        },
        subscription: order.subscription || null,
      };
    }),
  );

  return Response(true, null, {
    payments,
    meta: { page: safePage, pageSize: safePageSize, total },
  });
}

async function ListPaymentMethods({ customerId } = {}) {
  const methods = await PaymentMethod.find({ customer: customerId })
    .select("+providerReference")
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();

  const paymentMethods = await Promise.all(
    methods.map(async (method) => {
      if (method.provider !== "stripe" || !method.providerReference) {
        return {
          _id: method._id,
          type: method.type,
          isDefault: method.isDefault,
          cardBrand: null,
          lastFour: null,
          expiryMonth: null,
          expiryYear: null,
        };
      }

      try {
        const stripeMethod = await stripe.paymentMethods.retrieve(
          method.providerReference,
        );

        return {
          _id: method._id,
          type: "card",
          isDefault: method.isDefault,
          ...normalizeStripeCard(stripeMethod),
        };
      } catch {
        return {
          _id: method._id,
          type: method.type,
          isDefault: method.isDefault,
          cardBrand: null,
          lastFour: null,
          expiryMonth: null,
          expiryYear: null,
        };
      }
    }),
  );

  return Response(true, null, { paymentMethods });
}

async function GetStripeConfig() {
  if (!STRIPE_PUBLISHABLE_KEY) {
    return Response(false, "Stripe publishable key is not configured", null);
  }

  return Response(true, null, {
    publishableKey: STRIPE_PUBLISHABLE_KEY,
  });
}

async function CreateSetupIntent({ customerId } = {}) {
  const customer = await ensureStripeCustomer(customerId);
  if (!customer) return Response(false, "Customer not found", null);

  if (!STRIPE_PUBLISHABLE_KEY) {
    return Response(false, "Stripe publishable key is not configured", null);
  }

  const intent = await stripe.setupIntents.create({
    customer: customer.stripeCustomerId,
    payment_method_types: ["card"],
    usage: "off_session",
    metadata: {
      customerId: String(customer._id),
    },
  });

  return Response(true, null, {
    clientSecret: intent.client_secret,
    publishableKey: STRIPE_PUBLISHABLE_KEY,
  });
}

async function AttachPaymentMethod({
  customerId,
  stripePaymentMethodId,
  setDefault = true,
} = {}) {
  if (!stripePaymentMethodId) {
    return Response(false, "Stripe payment method is required", null);
  }

  const customer = await ensureStripeCustomer(customerId);
  if (!customer) return Response(false, "Customer not found", null);

  await stripe.paymentMethods.attach(stripePaymentMethodId, {
    customer: customer.stripeCustomerId,
  });

  let method = await PaymentMethod.findOne({
    customer: customer._id,
    provider: "stripe",
    providerReference: stripePaymentMethodId,
  }).select("+providerReference");

  if (!method) {
    method = await PaymentMethod.create({
      customer: customer._id,
      type: "card",
      provider: "stripe",
      providerReference: stripePaymentMethodId,
      isDefault: false,
    });
  }

  const hasDefault = await PaymentMethod.exists({
    customer: customer._id,
    isDefault: true,
  });
  const shouldSetDefault = Boolean(setDefault || !hasDefault);

  if (shouldSetDefault) {
    await PaymentMethod.updateMany(
      { customer: customer._id, isDefault: true },
      { $set: { isDefault: false } },
    );

    method.isDefault = true;
    await method.save();

    await stripe.customers.update(customer.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: stripePaymentMethodId,
      },
    });
  }

  const stripeMethod = await stripe.paymentMethods.retrieve(
    stripePaymentMethodId,
  );

  return Response(true, "Payment method saved", {
    paymentMethod: {
      _id: method._id,
      type: "card",
      isDefault: method.isDefault,
      ...normalizeStripeCard(stripeMethod),
    },
  });
}

async function SetDefaultPaymentMethod({ customerId, paymentMethodId } = {}) {
  const method = await PaymentMethod.findOne({
    _id: paymentMethodId,
    customer: customerId,
  }).select("+providerReference");
  if (!method) return Response(false, "Payment method not found", null);

  if (method.provider === "stripe" && method.providerReference) {
    const customer = await ensureStripeCustomer(customerId);
    if (!customer || !customer.stripeCustomerId) {
      return Response(false, "Customer stripe profile not found", null);
    }

    await stripe.customers.update(customer.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: method.providerReference,
      },
    });
  }

  await PaymentMethod.updateMany(
    { customer: customerId, isDefault: true },
    { $set: { isDefault: false } },
  );
  method.isDefault = true;
  await method.save();

  return Response(true, "Default payment method updated", {
    paymentMethod: method,
  });
}

async function DeletePaymentMethod({ customerId, paymentMethodId } = {}) {
  const method = await PaymentMethod.findOne({
    _id: paymentMethodId,
    customer: customerId,
  }).select("+providerReference");
  if (!method) return Response(false, "Payment method not found", null);

  const activeSubscriptions = await Subscription.countDocuments({
    customer: customerId,
    status: "active",
    paymentMethod: method._id,
  });
  if (activeSubscriptions > 0) {
    return Response(
      false,
      "This payment method is linked to active subscriptions. Set another default method first.",
      null,
    );
  }

  if (method.provider === "stripe" && method.providerReference) {
    try {
      await stripe.paymentMethods.detach(method.providerReference);
    } catch {
      // Ignore detach failures if Stripe method is already detached.
    }
  }

  await method.deleteOne();

  if (method.isDefault) {
    const nextMethod = await PaymentMethod.findOne({ customer: customerId })
      .select("+providerReference")
      .sort({ createdAt: 1 });

    if (nextMethod) {
      nextMethod.isDefault = true;
      await nextMethod.save();

      if (nextMethod.provider === "stripe" && nextMethod.providerReference) {
        const customer = await ensureStripeCustomer(customerId);
        if (customer && customer.stripeCustomerId) {
          await stripe.customers.update(customer.stripeCustomerId, {
            invoice_settings: {
              default_payment_method: nextMethod.providerReference,
            },
          });
        }
      }
    } else {
      const customer = await getCustomerWithStripeId(customerId);
      if (customer && customer.stripeCustomerId) {
        await stripe.customers.update(customer.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: null,
          },
        });
      }
    }
  }

  return Response(true, "Payment method removed", null);
}

// ===== Admin-facing =====

async function AdminListPayments({
  customerId,
  subscriptionId,
  status,
  page = 1,
  pageSize = 20,
} = {}) {
  const filter = {};
  if (customerId) filter.customer = customerId;
  if (subscriptionId) filter.subscription = subscriptionId;
  if (status) filter.status = status;

  const total = await Payment.countDocuments(filter);
  const payments = await Payment.find(filter)
    .populate("customer", "firstName lastName email")
    .populate("order", "orderId status total")
    .populate("subscription", "subscriptionNumber")
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return Response(true, null, { payments, meta: { page, pageSize, total } });
}

async function AdminGetPayment({ paymentId } = {}) {
  const payment = await Payment.findById(paymentId)
    .populate("customer", "firstName lastName email phone")
    .populate("order", "orderId status total items")
    .populate("subscription", "subscriptionNumber status frequency")
    .lean();

  if (!payment) return Response(false, "Payment not found", null);
  return Response(true, null, { payment });
}

async function AdminUpdatePaymentStatus({
  paymentId,
  status,
  notes,
  updatedBy,
} = {}) {
  const payment = await Payment.findById(paymentId);
  if (!payment) return Response(false, "Payment not found", null);

  const validTransitions = {
    pending: ["paid", "failed"],
    failed: ["paid", "pending"],
    paid: ["refunded"],
    refunded: [],
  };

  const allowed = validTransitions[payment.status] || [];
  if (!allowed.includes(status)) {
    return Response(
      false,
      `Cannot transition payment from "${payment.status}" to "${status}"`,
      null,
    );
  }

  payment.status = status;
  if (notes) payment.notes = notes;
  if (updatedBy) payment.updatedBy = updatedBy;

  if (status === "paid") payment.paidAt = new Date();
  if (status === "failed") payment.failedAt = new Date();
  if (status === "refunded") payment.refundedAt = new Date();

  await payment.save();
  return Response(true, "Payment updated", { payment });
}

module.exports = {
  GetStripeConfig,
  CreateSetupIntent,
  AttachPaymentMethod,
  ListPayments,
  ListPaymentMethods,
  SetDefaultPaymentMethod,
  DeletePaymentMethod,
  AdminListPayments,
  AdminGetPayment,
  AdminUpdatePaymentStatus,
};
