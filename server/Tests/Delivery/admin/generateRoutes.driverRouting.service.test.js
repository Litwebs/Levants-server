process.env.WAREHOUSE_LAT = process.env.WAREHOUSE_LAT || "51.5074";
process.env.WAREHOUSE_LNG = process.env.WAREHOUSE_LNG || "-0.1278";

jest.mock("../../../services/googleRoute.service", () => ({
  optimizeRoutes: jest.fn(async (requestBody) => {
    const start = new Date(requestBody.model.globalStartTime).getTime();

    return {
      routes: [
        {
          visits: requestBody.model.shipments.map((shipment, index) => ({
            shipmentIndex: index,
            shipmentLabel: shipment.label,
            startTime: new Date(start + index * 10 * 60 * 1000).toISOString(),
          })),
          metrics: {
            travelDistanceMeters: 1000,
            totalDuration: "1800s",
          },
          routePolyline: { points: "encoded_polyline" },
        },
      ],
    };
  }),
}));

const DeliveryBatch = require("../../../models/deliveryBatch.model");
const Route = require("../../../models/route.model");
const Stop = require("../../../models/stop.model");
const { generateRoutesForBatch } = require("../../../services/route.service");
const { optimizeRoutes } = require("../../../services/googleRoute.service");
const { createUser } = require("../../helpers/authTestData");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../../Orders/helpers/orderFactory");

async function createPaidOrder({ postcode, lat, lng }) {
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
      orderId: `ORD-${postcode.replace(/\s+/g, "")}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`,
      paidAt: new Date(),
      deliveryStatus: "ordered",
      deliveryAddress: {
        line1: "10 Test Street",
        line2: "",
        city: "London",
        postcode,
        country: "United Kingdom",
      },
      location: { lat, lng },
      deliveryDate: new Date(Date.UTC(2026, 3, 11, 0, 0, 0, 0)),
    },
  });
}

describe("generateRoutesForBatch driver routing", () => {
  test("assigns orders by postcode area and uses each driver's own start time", async () => {
    const driverA = await createUser({
      role: "driver",
      name: "Driver A",
      driverRouting: {
        postcodeAreas: ["E1", "E2"],
        routeStartTime: "08:00",
      },
    });
    const driverB = await createUser({
      role: "driver",
      name: "Driver B",
      driverRouting: {
        postcodeAreas: ["N1", "N4"],
        routeStartTime: "09:30",
      },
    });

    const orderEast = await createPaidOrder({
      postcode: "E1 6AA",
      lat: 51.5202,
      lng: -0.0759,
    });
    const orderNorth = await createPaidOrder({
      postcode: "N1 1AA",
      lat: 51.5362,
      lng: -0.1034,
    });
    const orderUnassigned = await createPaidOrder({
      postcode: "W1 2AB",
      lat: 51.5154,
      lng: -0.141,
    });

    const batch = await DeliveryBatch.create({
      deliveryDate: new Date(Date.UTC(2026, 3, 11, 0, 0, 0, 0)),
      status: "locked",
      orders: [orderEast._id, orderNorth._id, orderUnassigned._id],
      routes: [],
    });

    const result = await generateRoutesForBatch({
      batchId: String(batch._id),
      driverIds: [String(driverA._id), String(driverB._id)],
    });

    expect(result.success).toBe(true);
    expect(result.data.routesCreated).toBe(2);
    expect(result.data.unassignedOrdersCount).toBe(1);
    expect(result.data.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "NO_DRIVER_MATCH",
          orderDbId: String(orderUnassigned._id),
        }),
      ]),
    );

    expect(optimizeRoutes).toHaveBeenCalledTimes(2);

    const calls = optimizeRoutes.mock.calls.map(([request]) => ({
      driverId: request.model.vehicles[0].label,
      start: request.model.globalStartTime,
    }));

    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driverId: String(driverA._id),
          start: expect.stringContaining("T07:00:00.000Z"),
        }),
        expect.objectContaining({
          driverId: String(driverB._id),
          start: expect.stringContaining("T08:30:00.000Z"),
        }),
      ]),
    );

    const routes = await Route.find({ batch: batch._id }).lean();
    expect(routes).toHaveLength(2);

    const stops = await Stop.find({}).populate("order").lean();
    expect(stops.map((stop) => String(stop.order._id))).toEqual(
      expect.arrayContaining([String(orderEast._id), String(orderNorth._id)]),
    );
    expect(stops.map((stop) => String(stop.order._id))).not.toContain(
      String(orderUnassigned._id),
    );

    const updatedBatch = await DeliveryBatch.findById(batch._id).lean();
    expect(updatedBatch.routeGeneration.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "NO_DRIVER_MATCH",
          orderDbId: String(orderUnassigned._id),
        }),
      ]),
    );
  });

  test("returns a warning-driven failure when a postcode matches multiple drivers", async () => {
    const driverA = await createUser({
      role: "driver",
      name: "Driver A",
      driverRouting: {
        postcodeAreas: ["E"],
        routeStartTime: "08:00",
      },
    });
    const driverB = await createUser({
      role: "driver",
      name: "Driver B",
      driverRouting: {
        postcodeAreas: ["E1"],
        routeStartTime: "08:30",
      },
    });

    const order = await createPaidOrder({
      postcode: "E1 7BB",
      lat: 51.519,
      lng: -0.072,
    });

    const batch = await DeliveryBatch.create({
      deliveryDate: new Date(Date.UTC(2026, 3, 11, 0, 0, 0, 0)),
      status: "locked",
      orders: [order._id],
      routes: [],
    });

    const result = await generateRoutesForBatch({
      batchId: String(batch._id),
      driverIds: [String(driverA._id), String(driverB._id)],
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "MULTIPLE_DRIVER_MATCH",
          orderDbId: String(order._id),
          driverIds: expect.arrayContaining([
            String(driverA._id),
            String(driverB._id),
          ]),
        }),
      ]),
    );
  });

  test("fails validation when a selected driver has no postcode areas or start time", async () => {
    const driver = await createUser({
      role: "driver",
      name: "Driver Missing Config",
      driverRouting: {
        postcodeAreas: [],
        routeStartTime: null,
      },
    });

    const order = await createPaidOrder({
      postcode: "E1 6AA",
      lat: 51.5202,
      lng: -0.0759,
    });

    const batch = await DeliveryBatch.create({
      deliveryDate: new Date(Date.UTC(2026, 3, 11, 0, 0, 0, 0)),
      status: "locked",
      orders: [order._id],
      routes: [],
    });

    const result = await generateRoutesForBatch({
      batchId: String(batch._id),
      driverIds: [String(driver._id)],
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.validationErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "DRIVER_POSTCODE_AREAS_MISSING",
          driverId: String(driver._id),
        }),
        expect.objectContaining({
          type: "DRIVER_START_TIME_MISSING",
          driverId: String(driver._id),
        }),
      ]),
    );
  });

  test("allows manually assigned stops before optimization even when postcode areas do not match", async () => {
    const driver = await createUser({
      role: "driver",
      name: "Manual Driver",
      driverRouting: {
        postcodeAreas: [],
        routeStartTime: "08:15",
      },
    });

    const order = await createPaidOrder({
      postcode: "W1 2AB",
      lat: 51.5154,
      lng: -0.141,
    });

    const batch = await DeliveryBatch.create({
      deliveryDate: new Date(Date.UTC(2026, 3, 11, 0, 0, 0, 0)),
      status: "locked",
      orders: [order._id],
      routes: [],
    });

    const result = await generateRoutesForBatch({
      batchId: String(batch._id),
      driverIds: [String(driver._id)],
      manualAssignments: [
        {
          orderDbId: String(order._id),
          driverId: String(driver._id),
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data.routesCreated).toBe(1);
    expect(result.data.unassignedOrdersCount).toBe(0);

    const routes = await Route.find({ batch: batch._id }).lean();
    expect(routes).toHaveLength(1);

    const stops = await Stop.find({ route: routes[0]._id })
      .populate("order")
      .lean();
    expect(stops).toHaveLength(1);
    expect(String(stops[0].order._id)).toBe(String(order._id));
  });
});
