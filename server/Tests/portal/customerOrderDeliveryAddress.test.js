"use strict";

const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../testApp");
const Order = require("../../models/order.model");
const { geocodeAddress } = require("../../Integration/google.geocode");
const { createPortalCustomer, loginPortalCustomer } = require("./helpers");

describe("Portal order delivery address updates", () => {
  it("re-geocodes the order when the customer changes delivery address", async () => {
    const creds = await createPortalCustomer();
    const { customer } = creds;
    const auth = await loginPortalCustomer(creds);

    customer.addresses.push({
      label: "Work",
      fullName: "Test Customer",
      line1: "25 New Delivery Road",
      city: "Bradford",
      postcode: "BD1 2AB",
      country: "United Kingdom",
      isDefault: false,
    });
    await customer.save();

    const newAddress = customer.addresses[customer.addresses.length - 1];
    const deliveryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const order = await Order.create({
      customer: customer._id,
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          variant: new mongoose.Types.ObjectId(),
          name: "Test product",
          sku: "TEST-DELIVERY-ADDRESS",
          price: 10,
          quantity: 1,
          subtotal: 10,
        },
      ],
      subtotal: 10,
      total: 10,
      deliveryAddress: {
        line1: customer.addresses[0].line1,
        city: customer.addresses[0].city,
        postcode: customer.addresses[0].postcode,
        country: customer.addresses[0].country,
      },
      deliveryDate,
      location: { lat: 51.501, lng: -0.141 },
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      paidAt: new Date(),
      amountPaid: 10,
    });

    geocodeAddress.mockResolvedValueOnce({ lat: 53.7938, lng: -1.7524 });

    const res = await request(app)
      .patch(`/api/portal/orders/${order._id}/delivery`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ deliveryAddressId: String(newAddress._id) });

    expect(res.status).toBe(200);
    expect(geocodeAddress).toHaveBeenCalledWith({
      line1: "25 New Delivery Road",
      line2: null,
      city: "Bradford",
      postcode: "BD1 2AB",
      country: "United Kingdom",
    });

    const updatedOrder = await Order.findById(order._id).lean();
    expect(updatedOrder.deliveryAddress).toMatchObject({
      line1: "25 New Delivery Road",
      city: "Bradford",
      postcode: "BD1 2AB",
      country: "United Kingdom",
    });
    expect(updatedOrder.location).toEqual({ lat: 53.7938, lng: -1.7524 });
  });

  it("keeps the existing coordinates if geocoding temporarily fails", async () => {
    const creds = await createPortalCustomer();
    const { customer } = creds;
    const auth = await loginPortalCustomer(creds);

    customer.addresses.push({
      label: "Work",
      fullName: "Test Customer",
      line1: "40 Backup Street",
      city: "Bradford",
      postcode: "BD1 3CD",
      country: "United Kingdom",
      isDefault: false,
    });
    await customer.save();

    const newAddress = customer.addresses[customer.addresses.length - 1];
    const deliveryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const originalLocation = { lat: 51.501, lng: -0.141 };

    const order = await Order.create({
      customer: customer._id,
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          variant: new mongoose.Types.ObjectId(),
          name: "Test product",
          sku: "TEST-DELIVERY-FALLBACK",
          price: 10,
          quantity: 1,
          subtotal: 10,
        },
      ],
      subtotal: 10,
      total: 10,
      deliveryAddress: {
        line1: customer.addresses[0].line1,
        city: customer.addresses[0].city,
        postcode: customer.addresses[0].postcode,
        country: customer.addresses[0].country,
      },
      deliveryDate,
      location: originalLocation,
      status: "paid",
      deliveryStatus: "ordered",
      reservationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      paidAt: new Date(),
      amountPaid: 10,
    });

    geocodeAddress.mockRejectedValueOnce(new Error("temporary geocoding outage"));

    const res = await request(app)
      .patch(`/api/portal/orders/${order._id}/delivery`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ deliveryAddressId: String(newAddress._id) });

    expect(res.status).toBe(200);

    const updatedOrder = await Order.findById(order._id).lean();
    expect(updatedOrder.deliveryAddress.line1).toBe("40 Backup Street");
    expect(updatedOrder.location).toEqual(originalLocation);
  });
});
