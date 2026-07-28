"use strict";

const {
  API_ORIGIN,
  CONTROL_ORIGIN,
  CONTROL_TOKEN,
} = require("./constants");

const controlHeaders = {
  "x-e2e-control-token": CONTROL_TOKEN,
};

async function responseJson(response, label) {
  const body = await response.json().catch(() => null);
  if (!response.ok()) {
    throw new Error(
      `${label} failed (${response.status()}): ${
        body?.message || JSON.stringify(body)
      }`,
    );
  }
  return body?.data;
}

async function reset(request) {
  const response = await request.post(`${CONTROL_ORIGIN}/reset`, {
    headers: controlHeaders,
  });
  return responseJson(response, "E2E reset");
}

async function createFixture(request, options) {
  const response = await request.post(`${CONTROL_ORIGIN}/fixtures`, {
    headers: controlHeaders,
    data: options,
    timeout: 90_000,
  });
  return responseJson(response, "E2E fixture creation");
}

async function getEmails(request) {
  const response = await request.get(`${CONTROL_ORIGIN}/emails`, {
    headers: controlHeaders,
  });
  return responseJson(response, "Email outbox read");
}

async function clearEmails(request) {
  const response = await request.delete(`${CONTROL_ORIGIN}/emails`, {
    headers: controlHeaders,
  });
  return responseJson(response, "Email outbox clear");
}

async function approveReview(request, orderId) {
  const response = await request.post(
    `${CONTROL_ORIGIN}/reviews/${encodeURIComponent(orderId)}/approve`,
    { headers: controlHeaders },
  );
  return responseJson(response, "Review approval");
}

async function getState(request, subscriptionId) {
  const response = await request.get(
    `${CONTROL_ORIGIN}/state/${subscriptionId}`,
    { headers: controlHeaders, timeout: 60_000 },
  );
  return responseJson(response, "E2E state read");
}

async function setPaymentOutcome(request, subscriptionId, outcome) {
  const response = await request.post(
    `${CONTROL_ORIGIN}/state/${subscriptionId}/payment-outcome`,
    { headers: controlHeaders, data: { outcome }, timeout: 30_000 },
  );
  return responseJson(response, "Stripe payment-method switch");
}

async function crossCutoff(request, subscriptionId) {
  const response = await request.post(
    `${CONTROL_ORIGIN}/state/${subscriptionId}/cross-cutoff`,
    { headers: controlHeaders },
  );
  return responseJson(response, "Cut-off transition");
}

async function autoResume(request, subscriptionId) {
  const response = await request.post(
    `${CONTROL_ORIGIN}/state/${subscriptionId}/auto-resume`,
    { headers: controlHeaders, timeout: 30_000 },
  );
  const body = await response.json().catch(() => ({}));
  return {
    ok: response.ok(),
    status: response.status(),
    error: response.ok() ? null : body?.message || "Automatic resume failed",
    ...(body?.data || {}),
  };
}

async function finalizeCancellation(request, subscriptionId, referenceDate) {
  const response = await request.post(
    `${CONTROL_ORIGIN}/state/${subscriptionId}/finalize-cancellation`,
    {
      headers: controlHeaders,
      data: { referenceDate },
      timeout: 30_000,
    },
  );
  return responseJson(response, "Scheduled cancellation finalization");
}

async function login(request, credentials) {
  const response = await request.post(`${API_ORIGIN}/api/portal/auth/login`, {
    data: credentials,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok() || !body?.data?.accessToken) {
    throw new Error(
      `Portal login failed (${response.status()}): ${body?.message || "unknown"}`,
    );
  }
  return body.data.accessToken;
}

function portalHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

module.exports = {
  API_ORIGIN,
  approveReview,
  autoResume,
  createFixture,
  clearEmails,
  crossCutoff,
  finalizeCancellation,
  getState,
  getEmails,
  login,
  portalHeaders,
  reset,
  setPaymentOutcome,
};
