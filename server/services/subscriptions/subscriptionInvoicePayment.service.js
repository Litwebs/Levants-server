"use strict";
const Payment = require("../../models/payment.model");

async function saveInvoicePayment(invoiceId, payment) {
  const subscriptionInvoiceKey = `${payment.subscription}:${invoiceId}:${payment.order}`;
  try {
    return await Payment.findOneAndUpdate({ subscriptionInvoiceKey }, {
      $setOnInsert: { ...payment, subscriptionInvoiceKey },
    }, { upsert: true, new: true, runValidators: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    // Another worker won the unique insert. Do not swallow unrelated failures.
    const winner = await Payment.findOne({ subscriptionInvoiceKey });
    if (!winner) throw error;
    return winner;
  }
}
module.exports = { saveInvoicePayment };
