import React from "react";
import { createRoot } from "react-dom/client";
import { NavigationDirections } from "../../src/pages/DeliveryRuns/components/NavigationDirections/NavigationDirections";
import "../../src/index.css";

// Mount the production component with links intercepted by the browser tests.
const links = new URLSearchParams(window.location.search).has("missing") ? null : {
  googleMaps: "https://www.google.com/maps/dir/?api=1&destination=53.795%2C-1.759&travelmode=driving",
  appleMaps: "https://maps.apple.com/?daddr=53.795%2C-1.759&dirflg=d",
  waze: "https://waze.com/ul?ll=53.795%2C-1.759&navigate=yes&utm_source=levants",
};
createRoot(document.getElementById("root")!).render(
  <div style={{ padding: 24 }} onClick={() => {
    document.getElementById("selection")!.textContent = "Stop selected";
  }}>
    <NavigationDirections links={links} />
    <p id="selection">Stop unchanged</p>
  </div>,
);
