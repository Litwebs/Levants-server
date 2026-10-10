"use strict";
const Mutation = require("../../models/subscriptionMutation.model");
const { executeIdempotentSubscriptionMutation } = require("../customerPortal/subscriptionMutation.service");
const service = require("../customerPortal/customerSubscriptions.service");
const actions = {
  create_subscription: "CreateSubscription", update_subscription: "UpdateSubscription",
  pause_subscription: "PauseSubscription", resume_subscription: "ResumeSubscription", cancel_subscription: "CancelSubscription",
  add_subscription_item: "AddSubscriptionItem", replace_subscription_items: "ReplaceSubscriptionItems",
  update_subscription_item: "UpdateSubscriptionItem", remove_subscription_item: "RemoveSubscriptionItem",
  add_next_delivery_add_on: "AddNextDeliveryAddOn",
};
async function recoverSavedOperation(customerId, operationId) {
  const mutation = await Mutation.findOne({ customer: customerId, operationId }).select("+requestPayload").lean();
  if (!mutation) throw new Error("The selected saved operation does not exist for this customer.");
  if (mutation.status === "completed" && mutation.response) return mutation.response;
  const action = actions[mutation.mutationType];
  if (!action || !mutation.requestPayload) throw new Error("This legacy operation needs its original customer request; it cannot be reconstructed safely.");
  return executeIdempotentSubscriptionMutation({ customerId, subscriptionId: mutation.subscription,
    operationId, mutationType: mutation.mutationType, payload: mutation.requestPayload,
    reserveResourceId: mutation.mutationType === "create_subscription",
    execute: async ({ resourceId }) => {
      const args = { ...mutation.requestPayload, customerId, subscriptionId: mutation.subscription,
        operationId, reservedSubscriptionId: resourceId };
      let result = mutation.subscription
        ? await service.RecoverSubscriptionItemIncrease(args) : null;
      if (!result) result = await service[action](args);
      if (result?.success && result.data?.subscription?._id) {
        const sync = await require("./subscriptionPriceReconciliation.service")
          .reconcileSubscriptionPrice(result.data.subscription._id, { lockHeld: Boolean(mutation.subscription) });
        result.data.billingSync = { status: sync.ok ? "synced" : "pending", action: sync.action };
      }
      return result;
    },
  });
}
module.exports = { recoverSavedOperation };
