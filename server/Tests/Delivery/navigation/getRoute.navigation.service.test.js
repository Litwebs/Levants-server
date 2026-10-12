jest.mock("../../../models/route.model", () => ({ findById: jest.fn() }));
jest.mock("../../../models/stop.model", () => ({ find: jest.fn() }));
jest.mock("../../../services/route.service", () => ({ generateRoutesForBatch: jest.fn() }));
jest.mock("../../../services/warehouse.service", () => ({ getRouteStockAggregation: jest.fn() }));
const Route = require("../../../models/route.model");
const Stop = require("../../../models/stop.model");
const { getRoute } = require("../../../services/delivery/delivery.route.service");
const { generateNavigationLinks } = require("../../../utils/navigation.util");

const driver = { _id: "driver-1", role: { name: "driver" } };
const route = { _id: "route-1", driver: { _id: "driver-1" } };
function mockQuery(result) {
  const query = { sort: jest.fn(), populate: jest.fn(), lean: jest.fn() };
  query.sort.mockReturnValue(query);
  query.populate.mockReturnValue(query);
  query.lean.mockResolvedValue(result);
  return query;
}
beforeEach(() => {
  jest.clearAllMocks();
  Route.findById.mockReturnValue(mockQuery(route));
  Stop.find.mockReturnValue(mockQuery([]));
});

describe("Delivery route navigation service", () => {
  test("adds navigation choices per stop without mutating stored records", async () => {
    const stops = [
      { _id: "a", sequence: 1, order: { location: { lat: 53, lng: -1 }, deliveryAddress: { line1: "One" } } },
      { _id: "b", sequence: 2, order: { location: { lat: 52, lng: -2 }, deliveryAddress: { line1: "Two" } } },
    ];
    Stop.find.mockReturnValue(mockQuery(stops));
    const result = await getRoute({ routeId: "route-1", user: driver });
    expect(result.success).toBe(true);
    expect(Stop.find).toHaveBeenCalledWith({ route: "route-1" });
    for (let i = 0; i < stops.length; i++) {
      expect(result.data.stops[i].navigationLinks).toEqual(generateNavigationLinks(stops[i].order.location, stops[i].order.deliveryAddress));
      expect(stops[i]).not.toHaveProperty("navigationLinks");
    }
  });
  test.each([null, {}, { lat: null, lng: null }, { lat: 100, lng: -1 }])("falls back to address for %j", async (location) => {
    const order = { location, deliveryAddress: { line1: "10 High Street", city: "Leeds", postcode: "LS1 1AA" } };
    Stop.find.mockReturnValue(mockQuery([{ order }]));
    const result = await getRoute({ routeId: "route-1", user: driver });
    expect(result.data.stops[0].navigationLinks).toEqual(generateNavigationLinks(null, order.deliveryAddress));
  });
  test("returns null links for a deleted order", async () => {
    Stop.find.mockReturnValue(mockQuery([{ order: null }]));
    const result = await getRoute({ routeId: "route-1", user: driver });
    expect(result.data.stops[0].navigationLinks).toBeNull();
    expect(result.data.stops[0].navigationUrl).toBeNull();
  });
  test("conceals another driver's route before fetching stops", async () => {
    const result = await getRoute({ routeId: "route-1", user: { _id: "other", role: { name: "driver" } } });
    expect(result.statusCode).toBe(404);
    expect(Stop.find).not.toHaveBeenCalled();
  });
  test("allows administrative users to read navigation links", async () => {
    const result = await getRoute({ routeId: "route-1", user: { _id: "admin", role: { name: "admin" } } });
    expect(result.success).toBe(true);
  });
  test("returns 404 for an unknown route", async () => {
    Route.findById.mockReturnValue(mockQuery(null));
    expect((await getRoute({ routeId: "missing", user: driver })).statusCode).toBe(404);
    expect(Stop.find).not.toHaveBeenCalled();
  });
  test("requires a route identifier", async () => {
    expect((await getRoute({ user: driver })).statusCode).toBe(400);
    expect(Route.findById).not.toHaveBeenCalled();
  });
});
