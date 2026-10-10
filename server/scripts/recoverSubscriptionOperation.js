"use strict";
// Read-only unless --apply is supplied. Select exactly one invoice, saved
// mutation, or card operation; the normal leases and immutable keys still apply.
const mongoose = require("mongoose");
const env = require("../config/env");
const Mutation = require("../models/subscriptionMutation.model");
const Customer = require("../models/customer.model");
const Plan = require("../models/subscriptionInvoiceFulfillment.model");
const stripe = require("../utils/stripe.util");
const argument = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
async function main() {
  const invoiceId = argument("--invoice");
  const operationId = argument("--operation");
  const card = process.argv.includes("--card");
  const profile = process.argv.includes("--profile");
  const customerId = argument("--customer");
  const apply = process.argv.includes("--apply");
  if ([Boolean(invoiceId), Boolean(operationId), card, profile].filter(Boolean).length !== 1) {
    throw new Error("Select exactly one of --invoice in_..., --operation UUID, --card, or --profile.");
  }
  if (!invoiceId && !mongoose.Types.ObjectId.isValid(customerId)) throw new Error("Select the exact --customer ObjectId.");
  await mongoose.connect(env.mongoUri, { autoIndex: false, autoCreate: false });
  try {
    if (invoiceId) {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      const plan = await Plan.findOne({ invoiceId }).lean();
      console.log(JSON.stringify({ invoiceId, status: invoice.status, amountPaidMinor: invoice.amount_paid,
        planId: plan?._id || null, completed: Boolean(plan?.completedAt), refunded: Boolean(plan?.refundedAt), apply }));
      if (apply) {
        const service = require("../services/subscriptions/subscriptionWebhook.service");
        if (invoice.status === "paid") await service.HandleSubscriptionInvoicePaid(invoice);
        else if (invoice.status === "draft") await service.HandleSubscriptionInvoiceCreated(invoice);
        else if (["void", "uncollectible"].includes(invoice.status)) await service.HandleSubscriptionInvoiceClosed(invoice);
        else throw new Error("This invoice is still unpaid. Review its provider state; no new payment was started.");
      }
    } else if (profile) {
      const customer = await Customer.findById(customerId).select("+stripeCustomerCreation").lean();
      if (!customer?.stripeCustomerCreation) throw new Error("No saved customer-profile creation requires recovery.");
      console.log(JSON.stringify({ customerId, operationId: customer.stripeCustomerCreation.id,
        startedAt: customer.stripeCustomerCreation.startedAt, apply }));
      if (apply) await require("../services/customerPortal/subscriptionCustomerIdentity.service").ensureCustomerIdentity(customerId);
    } else if (card) {
      const customer = await Customer.findById(customerId).select("+paymentMethodOperation").lean();
      if (!customer) throw new Error("The selected customer does not exist.");
      console.log(JSON.stringify({ customerId, savedCardOperation: Boolean(customer.paymentMethodOperation), apply }));
      if (apply) await require("../services/customerPortal/customerPayments.service").ListPaymentMethods({ customerId });
    } else {
      const mutation = await Mutation.findOne({ customer: customerId, operationId }).select("+requestPayload").lean();
      if (!mutation) throw new Error("The selected operation does not exist for this customer.");
      console.log(JSON.stringify({ customerId, operationId, mutationType: mutation.mutationType,
        status: mutation.status, originalRequestAvailable: Boolean(mutation.requestPayload), apply }));
      if (apply) {
        const result = await require("../services/subscriptions/subscriptionOperationRecovery.service").recoverSavedOperation(customerId, operationId);
        if (!result?.success) throw new Error(result?.message || "Recovery remains unresolved.");
        console.log(JSON.stringify({ operationId, completed: true }));
      }
    }
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
