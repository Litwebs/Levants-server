const { generateNavigationLinks, generateGoogleMapsLink, normalizeBaseUrl } = require("../../../utils/navigation.util");

describe("Delivery navigation links", () => {
  test.each([[53.795, -1.759], [0, 0], [-90, -180], [90, 180]])("passes coordinates %s,%s to each service", (lat, lng) => {
    const links = generateNavigationLinks({ lat, lng }, { line1: "Ignored address" });
    const google = new URL(links.googleMaps);
    const apple = new URL(links.appleMaps);
    const waze = new URL(links.waze);
    expect(google.origin + google.pathname).toBe("https://www.google.com/maps/dir/");
    expect(google.searchParams.get("api")).toBe("1");
    expect(google.searchParams.get("destination")).toBe(`${lat},${lng}`);
    expect(google.searchParams.get("travelmode")).toBe("driving");
    expect(google.searchParams.has("origin")).toBe(false);
    expect(apple.origin).toBe("https://maps.apple.com");
    expect(apple.searchParams.get("daddr")).toBe(`${lat},${lng}`);
    expect(apple.searchParams.get("dirflg")).toBe("d");
    expect(waze.origin + waze.pathname).toBe("https://waze.com/ul");
    expect(waze.searchParams.get("ll")).toBe(`${lat},${lng}`);
    expect(waze.searchParams.get("navigate")).toBe("yes");
    expect(waze.searchParams.has("q")).toBe(false);
  });

  test.each([undefined, null, {}, { lat: null, lng: null }, { lat: "", lng: "" },
    { lat: "53", lng: "-1" }, { lat: NaN, lng: 0 }, { lat: 0, lng: Infinity },
    { lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: 52 }])(
    "falls back to the complete encoded address for invalid location %j", (location) => {
      const address = { line1: " 10 King's & Queen's Road ", line2: "Flat #2", city: "Leeds", postcode: "LS1 1AA", country: "United Kingdom" };
      const destination = "10 King's & Queen's Road, Flat #2, Leeds, LS1 1AA, United Kingdom";
      const links = generateNavigationLinks(location, address);
      for (const [key, param] of [["googleMaps", "destination"], ["appleMaps", "daddr"], ["waze", "q"]]) {
        const url = new URL(links[key]);
        expect(url.searchParams.get(param)).toBe(destination);
        expect(url.searchParams.has("Queen's Road")).toBe(false);
        expect(url.protocol).toBe("https:");
      }
      expect(new URL(links.waze).searchParams.has("ll")).toBe(false);
    });

  test.each([undefined, null, {}, { line1: "  ", postcode: "" }, { line1: 123 }])(
    "returns no links without a usable destination %j", (address) => {
      expect(generateNavigationLinks(null, address)).toBeNull();
    });
  test("supports a partial address without empty separators", () => {
    expect(new URL(generateNavigationLinks(null, { postcode: " BD1 1AA " }).googleMaps).searchParams.get("destination")).toBe("BD1 1AA");
  });
  test("preserves existing public utility contracts", () => {
    expect(generateGoogleMapsLink(53, -1)).toBe("https://www.google.com/maps/search/?api=1&query=53,-1");
    expect(normalizeBaseUrl("https://example.com/")).toBe("https://example.com");
  });
});
