import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { NavigationDirections } from "../../src/pages/DeliveryRuns/components/NavigationDirections/NavigationDirections";
import "../../src/index.css";

function Fixture() {
  const [selection, setSelection] = useState("Stop unchanged");
  const links = new URLSearchParams(location.search).has("missing") ? null : {
    googleMaps: "https://www.google.com/maps/dir/?api=1&destination=53.795%2C-1.759&travelmode=driving",
    appleMaps: "https://maps.apple.com/?daddr=53.795%2C-1.759&dirflg=d",
    waze: "https://waze.com/ul?ll=53.795%2C-1.759&navigate=yes&utm_source=levants",
  };
  return <div onClick={() => setSelection("Stop selected")}>
    <p id="selection">{selection}</p>
    <NavigationDirections links={links} />
  </div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
