import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getRun } from "@/context/DeliveryRuns/deliveryRunsApi";
import { MapView } from "@/pages/DeliveryRuns/components/MapView/MapView";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/context/api", () => ({ default: { get } }));
vi.mock("@/context/Auth/AuthContext", () => ({ useAuth: () => ({ user: { role: "driver" } }) }));
vi.mock("@/context/Orders", () => ({ useOrdersApi: () => ({}) }));
vi.mock("@/context/DeliveryRuns", () => ({
  DEPOT_LOCATION: { lat: 53.795, lng: -1.759, label: "Test depot" },
  getVanColor: () => "#1a5f4a",
  getVanStyleKey: () => "van1",
  formatManifestItemSku: (sku: string) => sku,
  getDepotLocation: async () => null,
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => false }) }));
vi.mock("@/components/common/Toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
// Map rendering is unrelated to the stop-list navigation menu under test.
vi.mock("react-leaflet", () => ({ MapContainer: () => null, TileLayer: () => null, Marker: () => null, Popup: () => null, useMap: vi.fn() }));

const links = {
  googleMaps: "https://www.google.com/maps/dir/?api=1&destination=53.795%2C-1.759&travelmode=driving",
  appleMaps: "https://maps.apple.com/?daddr=53.795%2C-1.759&dirflg=d",
  waze: "https://waze.com/ul?ll=53.795%2C-1.759&navigate=yes&utm_source=levants",
};
let serverLinks: typeof links | null;
beforeEach(() => {
  serverLinks = links;
  get.mockImplementation(async (url: string) => {
    if (url === "/admin/delivery/batch/run-1") return { data: { data: {
      _id: "run-1", deliveryDate: "2026-10-18", status: "routed", orders: [], routes: [{ _id: "route-1" }],
    } } };
    if (url === "/admin/delivery/route/route-1") return { data: { data: { stops: [{
      _id: "stop-1", sequence: 1, navigationLinks: serverLinks,
      order: { _id: "order-1", orderId: "ORD-TEST", customer: { firstName: "Test", lastName: "Customer" },
        deliveryAddress: { line1: "Test address", postcode: "BD1 1AA" }, location: { lat: 53.795, lng: -1.759 }, items: [] },
    }] } } };
    return { data: { data: { items: [] } } };
  });
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

async function mountRun() {
  const run = await getRun("run-1");
  const onSelectStop = vi.fn();
  render(<MapView vans={run!.vans} selectedVan="all" onSelectVan={vi.fn()} onSelectStop={onSelectStop} />);
  return { run, onSelectStop, user: userEvent.setup() };
}

test("route API links reach the real delivery stop list and offer all three apps", async () => {
  const { run, user, onSelectStop } = await mountRun();
  expect(run!.vans[0].stops[0].navigationLinks).toEqual(links);
  await user.click(screen.getByRole("button", { name: "Directions" }));
  expect(screen.getAllByRole("menuitem").map(item => item.textContent)).toEqual(["Google Maps", "Apple Maps", "Waze"]);
  for (const [name, href] of [["Google Maps", links.googleMaps], ["Apple Maps", links.appleMaps], ["Waze", links.waze]]) {
    const item = screen.getByRole("menuitem", { name });
    expect(item.getAttribute("href")).toBe(href);
    expect(item.getAttribute("target")).toBe("_blank");
    expect(item.getAttribute("rel")).toBe("noopener noreferrer");
  }
  expect(onSelectStop).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Directions" })));
});

test("legacy route responses retain the existing Google Maps link", async () => {
  serverLinks = null;
  await mountRun();
  expect(screen.queryByRole("button", { name: "Directions" })).toBeNull();
  const directions = screen.getByRole("link", { name: "Directions" });
  expect(directions.getAttribute("href")).toBe("https://www.google.com/maps/search/?api=1&query=53.795,-1.759");
  expect(directions.getAttribute("target")).toBe("_blank");
});

test("keyboard users can select a navigation app without selecting the stop", async () => {
  const { user, onSelectStop } = await mountRun();
  screen.getByRole("button", { name: "Directions" }).focus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Google Maps" })));
  await user.keyboard("{ArrowDown}");
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Apple Maps" }));
  expect(onSelectStop).not.toHaveBeenCalled();
});
