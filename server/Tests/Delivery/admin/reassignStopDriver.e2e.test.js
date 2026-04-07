const request = require("supertest");

const app = require("../../testApp");

const DeliveryBatch = require("../../../models/deliveryBatch.model");
const Route = require("../../../models/route.model");
const Stop = require("../../../models/stop.model");

const { loginAsAdmin } = require("../../helpers/loginAs");
const { createUser } = require("../../helpers/authTestData");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../../Orders/helpers/orderFactory");

describe("PATCH /api/admin/delivery/stops/:stopId/driver (E2E)", () => {
  const createPaidOrder = async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 5 });

    return createOrder({
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
        paidAt: new Date(),
        deliveryStatus: "ordered",
      },
    });
  };

  test("moves a stop onto an existing target driver route and resequences both routes", async () => {
    const adminCookie = await loginAsAdmin(app);
    const driverA = await createUser({ role: "driver", name: "Driver A" });
    const driverB = await createUser({ role: "driver", name: "Driver B" });

    const order1 = await createPaidOrder();
    const order2 = await createPaidOrder();
    const order3 = await createPaidOrder();

    const batch = await DeliveryBatch.create({
      deliveryDate: new Date(Date.UTC(2026, 3, 10, 0, 0, 0)),
      status: "routes_generated",
      orders: [order1._id, order2._id, order3._id],
      routes: [],
    });

    const routeA = await Route.create({
      batch: batch._id,
      driver: driverA._id,
      totalStops: 2,
      status: "planned",
    });

    const routeB = await Route.create({
      batch: batch._id,
      driver: driverB._id,
      totalStops: 1,
      status: "planned",
    });

    batch.routes = [routeA._id, routeB._id];
    await batch.save();

    const stop1 = await Stop.create({
      route: routeA._id,
      order: order1._id,
      sequence: 1,
    });

    const stop2 = await Stop.create({
      route: routeA._id,
      order: order2._id,
      sequence: 2,
    });

    await Stop.create({
      route: routeB._id,
      order: order3._id,
      sequence: 1,
    });

    const res = await request(app)
      .patch(`/api/admin/delivery/stops/${stop2._id}/driver`)
      .set("Cookie", adminCookie)
      .send({ driverId: String(driverB._id) });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.createdRoute).toBe(false);
    expect(res.body.data.removedEmptyRoute).toBe(false);

    const movedStop = await Stop.findById(stop2._id).lean();
    expect(String(movedStop.route)).toBe(String(routeB._id));
    expect(movedStop.sequence).toBe(2);

    const routeAStops = await Stop.find({ route: routeA._id })
      .sort({ sequence: 1 })
      .lean();
    const routeBStops = await Stop.find({ route: routeB._id })
      .sort({ sequence: 1 })
      .lean();

    expect(routeAStops.map((stop) => stop.sequence)).toEqual([1]);
    expect(routeAStops.map((stop) => String(stop._id))).toEqual([
      String(stop1._id),
    ]);
    expect(routeBStops.map((stop) => stop.sequence)).toEqual([1, 2]);

    const updatedRouteA = await Route.findById(routeA._id).lean();
    const updatedRouteB = await Route.findById(routeB._id).lean();

    expect(updatedRouteA.totalStops).toBe(1);
    expect(updatedRouteB.totalStops).toBe(2);
  });

  test("creates a target route when needed and removes the emptied source route", async () => {
    const adminCookie = await loginAsAdmin(app);
    const driverA = await createUser({ role: "driver", name: "Driver A" });
    const driverB = await createUser({ role: "driver", name: "Driver B" });

    const order = await createPaidOrder();

    const batch = await DeliveryBatch.create({
      deliveryDate: new Date(Date.UTC(2026, 3, 11, 0, 0, 0)),
      status: "routes_generated",
      orders: [order._id],
      routes: [],
    });

    const sourceRoute = await Route.create({
      batch: batch._id,
      driver: driverA._id,
      totalStops: 1,
      status: "planned",
    });

    batch.routes = [sourceRoute._id];
    await batch.save();

    const stop = await Stop.create({
      route: sourceRoute._id,
      order: order._id,
      sequence: 1,
    });

    const res = await request(app)
      .patch(`/api/admin/delivery/stops/${stop._id}/driver`)
      .set("Cookie", adminCookie)
      .send({ driverId: String(driverB._id) });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.createdRoute).toBe(true);
    expect(res.body.data.removedEmptyRoute).toBe(true);

    const movedStop = await Stop.findById(stop._id).lean();
    expect(movedStop).toBeTruthy();
    expect(movedStop.sequence).toBe(1);

    const deletedSourceRoute = await Route.findById(sourceRoute._id).lean();
    expect(deletedSourceRoute).toBeNull();

    const targetRoute = await Route.findById(res.body.data.routeId).lean();
    expect(targetRoute).toBeTruthy();
    expect(String(targetRoute.driver)).toBe(String(driverB._id));
    expect(targetRoute.totalStops).toBe(1);

    const updatedBatch = await DeliveryBatch.findById(batch._id).lean();
    expect(updatedBatch.routes.map((id) => String(id))).toEqual([
      String(targetRoute._id),
    ]);
    expect(String(movedStop.route)).toBe(String(targetRoute._id));
  });
});