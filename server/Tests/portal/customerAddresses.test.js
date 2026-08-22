"use strict";

const request = require("supertest");
const app = require("../testApp");
const { createPortalCustomer, loginPortalCustomer } = require("./helpers");

describe("Portal Addresses", () => {
  let accessToken;
  let customer;

  beforeEach(async () => {
    const creds = await createPortalCustomer();
    customer = creds.customer;
    const auth = await loginPortalCustomer(creds);
    accessToken = auth.accessToken;
  });

  it("lists addresses", async () => {
    const res = await request(app)
      .get("/api/portal/addresses")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.addresses)).toBe(true);
  });

  it("adds an address", async () => {
    const res = await request(app)
      .post("/api/portal/addresses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        line1: "10 New Street",
        city: "Bradford",
        postcode: "BD1 1AA",
        country: "United Kingdom",
        isDefault: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.address.line1).toBe("10 New Street");
  });

  it("rejects an address outside the delivery area", async () => {
    const res = await request(app)
      .post("/api/portal/addresses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        line1: "10 New Street",
        city: "Manchester",
        postcode: "M1 1AA",
        country: "United Kingdom",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/do not currently deliver/i);
  });

  it("cannot access another customer's addresses", async () => {
    customer.addresses[0].line1 = "Private First Customer Address";
    await customer.save();
    const other = await createPortalCustomer();
    const otherAuth = await loginPortalCustomer(other);

    // Try accessing the first customer's addresses with the second customer's token
    // (addresses are always scoped to req.customer so this just returns their own)
    const res = await request(app)
      .get("/api/portal/addresses")
      .set("Authorization", `Bearer ${otherAuth.accessToken}`);

    // Should only return their own addresses, not another customer's
    expect(res.status).toBe(200);
    const lines = (res.body.data.addresses ?? []).map(
      (address) => address.line1,
    );
    expect(lines).toContain("1 Test Street");
    expect(lines).not.toContain("Private First Customer Address");
  });
});
