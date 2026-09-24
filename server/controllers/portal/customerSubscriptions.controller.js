"use strict";

const service = require("../../services/customerPortal/customerSubscriptions.service");
const {
  executeIdempotentSubscriptionMutation,
} = require("../../services/customerPortal/subscriptionMutation.service");
const {
  reconcileSubscriptionPrice,
} = require("../../services/subscriptions/subscriptionPriceReconciliation.service");
const { sendOk, sendCreated, sendErr } = require("../../utils/response.util");

async function reconcileBillingForMutation(result) {
  const subscriptionId = result?.data?.subscription?._id;
  if (!result?.success || !subscriptionId) return result;

  const sync = await reconcileSubscriptionPrice(subscriptionId);
  result.data.billingSync = {
    status: sync.ok ? "synced" : "pending",
    action: sync.action,
  };

  if (result.data.subscription) {
    result.data.subscription.stripePriceSyncPending = !sync.ok;
    if (sync.priceId) {
      result.data.subscription.stripePriceId = sync.priceId;
    }
  }

  if (!sync.ok) {
    const baseMessage = result.message || "Subscription updated";
    result.message = `${baseMessage}. Your subscription change is saved, but the recurring billing update is pending and will retry automatically.`;
  }

  return result;
}

function mutationPayload(req, extra = {}) {
  const body = { ...(req.body || {}) };
  delete body.operationId;
  return { ...body, ...extra };
}

async function runMutation(
  req,
  {
    mutationType,
    subscriptionId = null,
    reserveResourceId = false,
    payload,
    execute,
  },
) {
  return executeIdempotentSubscriptionMutation({
    customerId: req.customer._id,
    subscriptionId,
    operationId: req.body?.operationId,
    expectedVersion: req.body?.expectedVersion,
    mutationType,
    payload,
    reserveResourceId,
    execute,
  });
}

function sendMutationError(res, result) {
  const conflict =
    result?.data?.idempotencyConflict ||
    result?.data?.idempotencyInProgress ||
    result?.data?.staleSubscription ||
    result?.data?.subscriptionBusy;
  return sendErr(res, {
    statusCode: conflict ? 409 : 400,
    message: result?.message || "Subscription change failed",
  });
}

const CreateSubscription = async (req, res) => {
  const result = await runMutation(req, {
    mutationType: "create_subscription",
    reserveResourceId: true,
    payload: mutationPayload(req),
    execute: ({ resourceId }) =>
      service.CreateSubscription({
        customerId: req.customer._id,
        ...mutationPayload(req),
        operationId: req.body?.operationId,
        reservedSubscriptionId: resourceId,
      }),
  });
  if (!result.success) return sendMutationError(res, result);
  return sendCreated(res, result.data, { message: result.message });
};

const ListSubscriptions = async (req, res) => {
  const result = await service.ListSubscriptions({
    customerId: req.customer._id,
    status: req.query.status,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
  });
  return sendOk(res, result.data);
};

const GetSubscriptionSettings = async (req, res) => {
  const result = await service.GetSubscriptionSettingsForCustomer();
  return sendOk(res, result.data);
};

const GetPreparedSubscriptionDraft = async (req, res) => {
  const result = await service.GetPreparedSubscriptionDraft({
    customerId: req.customer._id,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data);
};

const GetSubscription = async (req, res) => {
  const result = await service.GetSubscription({
    customerId: req.customer._id,
    subscriptionId: req.params.subscriptionId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data);
};

const UpdateSubscription = async (req, res) => {
  let result = await runMutation(req, {
    mutationType: "update_subscription",
    subscriptionId: req.params.subscriptionId,
    payload: mutationPayload(req),
    execute: async () => {
      let mutation = await service.UpdateSubscription({
        customerId: req.customer._id,
        subscriptionId: req.params.subscriptionId,
        ...mutationPayload(req),
        operationId: req.body?.operationId,
      });
      if (mutation.success) mutation = await reconcileBillingForMutation(mutation);
      return mutation;
    },
  });
  if (!result.success) return sendMutationError(res, result);
  return sendOk(res, result.data, { message: result.message });
};

const PauseSubscription = async (req, res) => {
  const result = await runMutation(req, {
    mutationType: "pause_subscription",
    subscriptionId: req.params.subscriptionId,
    payload: mutationPayload(req),
    execute: () =>
      service.PauseSubscription({
        customerId: req.customer._id,
        subscriptionId: req.params.subscriptionId,
        resumeOn: req.body?.resumeOn,
        refundMethod: req.body?.refundMethod,
      }),
  });
  if (!result.success) return sendMutationError(res, result);
  return sendOk(res, result.data, { message: result.message });
};

const ResumeSubscription = async (req, res) => {
  const result = await runMutation(req, {
    mutationType: "resume_subscription",
    subscriptionId: req.params.subscriptionId,
    payload: mutationPayload(req),
    execute: () =>
      service.ResumeSubscription({
        customerId: req.customer._id,
        subscriptionId: req.params.subscriptionId,
      }),
  });
  if (!result.success) return sendMutationError(res, result);
  return sendOk(res, result.data, { message: result.message });
};

const CancelSubscription = async (req, res) => {
  const result = await runMutation(req, {
    mutationType: "cancel_subscription",
    subscriptionId: req.params.subscriptionId,
    payload: mutationPayload(req),
    execute: () =>
      service.CancelSubscription({
        customerId: req.customer._id,
        subscriptionId: req.params.subscriptionId,
        reason: req.body?.reason,
        refundMethod: req.body?.refundMethod,
      }),
  });
  if (!result.success) return sendMutationError(res, result);
  return sendOk(res, result.data, { message: result.message });
};

const AddSubscriptionItem = async (req, res) => {
  const result = await runMutation(req, {
    mutationType: "add_subscription_item",
    subscriptionId: req.params.subscriptionId,
    payload: mutationPayload(req),
    execute: async () => {
      let mutation = await service.AddSubscriptionItem({
        customerId: req.customer._id,
        subscriptionId: req.params.subscriptionId,
        variantId: req.body.variantId,
        quantity: req.body.quantity,
        refundMethod: req.body.refundMethod,
        operationId: req.body?.operationId,
      });
      if (mutation.success) mutation = await reconcileBillingForMutation(mutation);
      return mutation;
    },
  });
  if (!result.success) return sendMutationError(res, result);
  return sendOk(res, result.data, { message: result.message });
};

const AddNextDeliveryAddOn = async (req, res) => {
  const result = await service.AddNextDeliveryAddOn({
    customerId: req.customer._id,
    subscriptionId: req.params.subscriptionId,
    operationId: req.body.operationId,
    items: req.body.items,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const ReplaceSubscriptionItems = async (req, res) => {
  const result = await runMutation(req, {
    mutationType: "replace_subscription_items",
    subscriptionId: req.params.subscriptionId,
    payload: mutationPayload(req),
    execute: async () => {
      let mutation = await service.ReplaceSubscriptionItems({
        customerId: req.customer._id,
        subscriptionId: req.params.subscriptionId,
        items: req.body.items,
        refundMethod: req.body.refundMethod,
        operationId: req.body?.operationId,
      });
      if (mutation.success) mutation = await reconcileBillingForMutation(mutation);
      return mutation;
    },
  });
  if (!result.success) return sendMutationError(res, result);
  return sendOk(res, result.data, { message: result.message });
};

const UpdateSubscriptionItem = async (req, res) => {
  const result = await runMutation(req, {
    mutationType: "update_subscription_item",
    subscriptionId: req.params.subscriptionId,
    payload: mutationPayload(req, { itemId: req.params.itemId }),
    execute: async () => {
      let mutation = await service.UpdateSubscriptionItem({
        customerId: req.customer._id,
        subscriptionId: req.params.subscriptionId,
        itemId: req.params.itemId,
        quantity: req.body.quantity,
        refundMethod: req.body.refundMethod,
        operationId: req.body?.operationId,
      });
      if (mutation.success) mutation = await reconcileBillingForMutation(mutation);
      return mutation;
    },
  });
  if (!result.success) return sendMutationError(res, result);
  return sendOk(res, result.data, { message: result.message });
};

const RemoveSubscriptionItem = async (req, res) => {
  const result = await runMutation(req, {
    mutationType: "remove_subscription_item",
    subscriptionId: req.params.subscriptionId,
    payload: mutationPayload(req, { itemId: req.params.itemId }),
    execute: async () => {
      let mutation = await service.RemoveSubscriptionItem({
        customerId: req.customer._id,
        subscriptionId: req.params.subscriptionId,
        itemId: req.params.itemId,
        refundMethod: req.body?.refundMethod,
        operationId: req.body?.operationId,
      });
      if (mutation.success) mutation = await reconcileBillingForMutation(mutation);
      return mutation;
    },
  });
  if (!result.success) return sendMutationError(res, result);
  return sendOk(res, result.data, { message: result.message });
};

const GetSubscriptionDeliveries = async (req, res) => {
  const result = await service.GetSubscriptionDeliveries({
    customerId: req.customer._id,
    subscriptionId: req.params.subscriptionId,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data);
};

module.exports = {
  CreateSubscription,
  ListSubscriptions,
  GetSubscription,
  GetSubscriptionSettings,
  GetPreparedSubscriptionDraft,
  UpdateSubscription,
  PauseSubscription,
  ResumeSubscription,
  CancelSubscription,
  AddSubscriptionItem,
  AddNextDeliveryAddOn,
  ReplaceSubscriptionItems,
  UpdateSubscriptionItem,
  RemoveSubscriptionItem,
  GetSubscriptionDeliveries,
};
