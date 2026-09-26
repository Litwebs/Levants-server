import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mapViewUrl = new URL(
  "../src/pages/DeliveryRuns/components/MapView/MapView.tsx",
  import.meta.url,
);
const source = readFileSync(mapViewUrl, "utf8");

assert.equal(
  source.includes("basemaps.cartocdn.com"),
  false,
  "MapView must not use the unauthenticated CARTO basemap endpoint",
);

assert.match(
  source,
  /https:\/\/\{s\}\.tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/,
  "MapView must retain the OpenStreetMap fallback tile URL",
);

for (const envName of [
  "VITE_MAP_LIGHT_TILE_URL",
  "VITE_MAP_DARK_TILE_URL",
  "VITE_MAP_TILES_ATTRIBUTION",
]) {
  assert.equal(
    source.includes(envName),
    true,
    `MapView must retain configurable tile setting ${envName}`,
  );
}

assert.equal(
  source.includes("eventHandlers={{ tileerror: handleTileError }}"),
  true,
  "MapView must retain runtime tile-error fallback handling",
);

assert.equal(
  source.includes("setTileFallbackActive(true)"),
  true,
  "MapView must activate the fallback when the configured provider fails",
);

console.log("Map tile configuration regression checks passed.");
