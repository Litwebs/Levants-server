"use strict";

const request = require("supertest");
const app = require("../testApp");
const Customer = require("../../models/customer.model");
const passwordUtil = require("../../utils/password.util");
const crypto = require("crypto");

/**
 * Create a registered portal customer and return { customer, email, password }
 */
async function createPortalCustomer({
  firstName = "Test",
  lastName = "Customer",
  email,
  password = "TestPass1",
} = {}) {
  const resolvedEmail = email ?? `portal-${crypto.randomUUID()}@test.com`;
  const passwordHash = await passwordUtil.hashPassword(password);

  const customer = await Customer.create({
    firstName,
    lastName,
    email: resolvedEmail,
    passwordHash,
    isGuest: false,
    status: "active",
    addresses: [
      {
        label: "Home",
        fullName: `${firstName} ${lastName}`,
        line1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
        isDefault: true,
      },
    ],
  });

  return { customer, email: resolvedEmail, password };
}

/**
 * Log in a portal customer and return { cookie, accessToken }
 */
async function loginPortalCustomer(appOrData, dataOrUndefined) {
  const isApp = typeof appOrData === "function";
  const testApp = isApp ? appOrData : app;
  const { email, password } = isApp ? dataOrUndefined : appOrData;

  const res = await request(testApp)
    .post("/api/portal/auth/login")
    .send({ email, password });

  if (res.status !== 200) {
    throw new Error(
      `Portal login failed for ${email}: ${res.status} – ${JSON.stringify(res.body)}`,
    );
  }

  const cookie = res.headers["set-cookie"];
  const accessToken = res.body?.data?.accessToken;

  return { cookie, accessToken };
}

module.exports = { createPortalCustomer, loginPortalCustomer };
