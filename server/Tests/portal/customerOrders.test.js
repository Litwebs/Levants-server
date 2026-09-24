"use strict";

const request = require("supertest");
const app = require("../testApp");
const Order = require("../../models/order.model");
const { geocodeAddress } = require("../../Integration/google.geocode");
const { createPortalCustomer, loginPortalCustomer } = require("./helpers");
const {
  createProduct,
  createVariant,
  createOrder,
} = require("../Orders/helpers/orderFactory");

describe("Portal order delivery updates", () => {
  let accessToken;
  let customer;
  let deliveryAddressId;
  let order;

  beforeEach(async () => {
    const creds = await createPortalCustomer();
    customer = creds.customer;
    const auth = await loginPortalCustomer(creds);
    accessToken = auth.accessToken;

    customer.addresses.push({
      label: "Work",
      fullName: "Test Customer",
      line1: "22 Updated Road",
      line2: "Suite 4",
      city: "Bradford",
      postcode: "BD1 1AA",
      country: "United Kingdom",
      isDefault: false,
    });
    await customer.save();
    deliveryAddressId = customer.addresses[customer.addresses.length - 1]._id;

    const product = await createProduct();
    const variant = await createVariant({ product, price: 5 });
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 7);
    deliveryDate.setHours(9, 0, 0, 0);

    order = await createOrder({
      status: "paid",
      customer,
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price,
          quantity: 1,
          subtotal: variant.price,
        },
      ],
      overrides: {
        subtotal: variant.price,
        total: variant.price,
        amountPaid: variant.price,
        paidAt: new Date(),
        deliveryStatus: "ordered",
        deliveryDate,
      },
    });
  });

  it("re-geocodes coordinates when a customer changes an order delivery address", async () => {
    geocodeAddress.mockResolvedValueOnce({ lat: 53.7938, lng: -1.7524 });

    const res = await request(app)
      .patch(`/api/portal/orders/${order._id}/delivery`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ deliveryAddressId: String(deliveryAddressId) });

    expect(res.status).toBe(200);
    expect(geocodeAddress).toHaveBeenCalledWith({
      line1: "22 Updated Road",
      line2: "Suite 4",
      city: "Bradford",
      postcode: "BD1 1AA",
      country: "United Kingdom",
    });

    const refreshed = await Order.findById(order._id).lean();
    expect(refreshed.deliveryAddress).toMatchObject({
      line1: "22 Updated Road",
      line2: "Suite 4",
      city: "Bradford",
      postcode: "BD1 1AA",
      country: "United Kingdom",
    });
    expect(refreshed.location).toMatchObject({
      lat: 53.7938,
      lng: -1.7524,
    });
  });

  it("keeps the previous coordinates if geocoding is temporarily unavailable", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    geocodeAddress.mockRejectedValueOnce(new Error("Maps unavailable"));

    const res = await request(app)
      .patch(`/api/portal/orders/${order._id}/delivery`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ deliveryAddressId: String(deliveryAddressId) });

    expect(res.status).toBe(200);

    const refreshed = await Order.findById(order._id).lean();
    expect(refreshed.deliveryAddress.line1).toBe("22 Updated Road");
    expect(refreshed.location).toMatchObject({
      lat: 51.5033635,
      lng: -0.1276248,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Geocoding failed while updating delivery"),
    );
  });
});
