"use strict";
const { test, expect } = require("@playwright/test");
const stripe = require("../../utils/stripe.util");
const { API_ORIGIN, createFixture, getState, login, portalHeaders, reset } = require("../support/e2e-client");
test.beforeEach(async ({ request }) => { await reset(request); });
for (const paused of [false, true]) {
  test(`changing a card migrates legacy billing and protects deletion (paused: ${paused})`, async ({ request }) => {
    const fixture = await createFixture(request, { cadence: "weekly-single-day", timing: "before-cutoff" });
    const auth = await login(request, fixture.credentials);
    const headers = portalHeaders(auth);
    const base = `${API_ORIGIN}/api/portal/payments/payment-methods`;
    const listed = await request.get(base, { headers });
    expect(listed.ok()).toBe(true);
    const old = (await listed.json()).data.paymentMethods.find(method => method.isDefault);
    const remoteCustomer = await stripe.customers.retrieve(fixture.stripeCustomerId);
    await stripe.subscriptions.update(fixture.stripeSubscriptionId, {
      default_payment_method: remoteCustomer.invoice_settings.default_payment_method,
    });
    if (paused) {
      const result = await request.post(`${API_ORIGIN}/api/portal/subscriptions/${fixture.subscriptionId}/pause`, {
        headers, data: { resumeOn: fixture.resumeOn },
      });
      expect(result.ok()).toBe(true);
    }
    const newCard = await stripe.paymentMethods.attach("pm_card_mastercard", { customer: fixture.stripeCustomerId });
    const saved = await request.post(`${base}/attach`, { headers,
      data: { stripePaymentMethodId: newCard.id, setDefault: true },
    });
    const body = await saved.json();
    expect(saved.ok(), JSON.stringify(body)).toBe(true);
    const newId = body.data.paymentMethod._id;
    const remote = await stripe.subscriptions.retrieve(fixture.stripeSubscriptionId);
    expect(remote.default_payment_method).toBeNull();
    expect(remote.default_source).toBeNull();
    expect((await stripe.customers.retrieve(fixture.stripeCustomerId)).invoice_settings.default_payment_method).toBe(newCard.id);
    const state = await getState(request, fixture.subscriptionId);
    expect(String(state.subscription.paymentMethod)).toBe(newId);
    expect(state.subscription.status).toBe(paused ? "paused" : "active");
    const removed = await request.delete(`${base}/${old._id}`, { headers });
    expect(removed.ok(), await removed.text()).toBe(true);
    const blocked = await request.delete(`${base}/${newId}`, { headers });
    expect(blocked.ok()).toBe(false);
    expect((await blocked.json()).message).toMatch(/Set another default card/);
    expect((await stripe.paymentMethods.retrieve(newCard.id)).customer).toBe(fixture.stripeCustomerId);
  });
}
