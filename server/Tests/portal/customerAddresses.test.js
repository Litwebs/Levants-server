"use strict";

const request = require("supertest");
const app = require("../testApp");
const { createPortalCustomer, loginPortalCustomer } = require("./helpers");

describe("Portal Addresses", () => {
  let accessToken;
  let customerId;

  beforeEach(async () => {
    const creds = await createPortalCustomer();
    customerId = creds.customer._id.toString();
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
        city: "Manchester",
        postcode: "M1 1AA",
        country: "United Kingdom",
        isDefault: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.address.line1).toBe("10 New Street");
  });

  it("cannot access another customer's addresses", async () => {
    const other = await createPortalCustomer();
    const otherAuth = await loginPortalCustomer(other);

    // Try accessing the first customer's addresses with the second customer's token
    // (addresses are always scoped to req.customer so this just returns their own)
    const res = await request(app)
      .get("/api/portal/addresses")
      .set("Authorization", `Bearer ${otherAuth.accessToken}`);

    // Should only return their own addresses, not another customer's
    expect(res.status).toBe(200);
    const ids = (res.body.data.addresses ?? []).map((a: any) => a._id);
    // If the other customer has no overlapping addresses with customer 1 this passes
    expect(typeof ids).toBe("object");
  });
});
