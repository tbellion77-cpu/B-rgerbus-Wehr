"use client";

import dynamic from "next/dynamic";

export type { MapLine, MapPoint, MapBus } from "./BusMap";

/** Karte nachgeladen: MapLibre und three.js blockieren so nicht den Seitenstart. */
const BusMap = dynamic(() => import("./BusMap"), {
  ssr: false,
  loading: () => <div aria-hidden style={{ position: "absolute", inset: 0, background: "#0d0e10" }} />,
});

export default BusMap;
