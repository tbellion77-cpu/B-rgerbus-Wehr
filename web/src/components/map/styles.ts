import type { StyleSpecification } from "maplibre-gl";
import { BOUNDS } from "@/lib/fahrplan";

export type BaseMap = "luftbild" | "karte";
export const BASE_LABEL: Record<BaseMap, string> = { luftbild: "Luftbild", karte: "Karte" };

// Straßen, Namen, Gebäude: OpenFreeMap (OpenStreetMap), frei, ohne Schlüssel
// Luftbild liegt auf der dunklen Karte: außerhalb des Bediengebiets ruhiger Graphit-Rand statt heller Fläche
const OFM = { luftbild: "https://tiles.openfreemap.org/styles/dark", karte: "https://tiles.openfreemap.org/styles/liberty" };
// Gelände: Terrain Tiles (Mapzen/AWS Open Data), frei, ohne Schlüssel
export const TERRAIN = {
  type: "raster-dem" as const,
  tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  encoding: "terrarium" as const,
  tileSize: 256,
  maxzoom: 15,
  attribution: "Gelände: Mapzen, AWS Open Data",
};
// Luftbild: Digitale Orthophotos 20 cm des LGL Baden-Württemberg, einmalig für das Bediengebiet vorberechnet
// (scripts/luftbild.mjs) und als Dateien mitgeliefert. Lizenz dl-de/by-2-0.
const PAD = 0.006;
export const AERIAL_BOUNDS: [number, number, number, number] = [BOUNDS[0][0] - PAD, BOUNDS[0][1] - PAD, BOUNDS[1][0] + PAD, BOUNDS[1][1] + PAD];
export const AERIAL_ZOOM = { min: 12, max: 18 };

const cache = new Map<BaseMap, StyleSpecification>();
export async function styleFor(base: BaseMap, origin: string): Promise<StyleSpecification> {
  const hit = cache.get(base);
  if (hit) return structuredClone(hit);
  const res = await fetch(OFM[base]);
  const st = (await res.json()) as StyleSpecification;
  if (base === "luftbild") {
    // Luftbild über alle Flächen, unter Straßennamen und Ortsbezeichnungen; 3D-Gebäude aus (verdecken sonst das Bild)
    st.layers = st.layers.filter((l) => l.type !== "fill-extrusion");
    st.sources.luftbild = {
      type: "raster",
      tiles: [`${origin}/luftbild/{z}/{x}/{y}.webp`],
      tileSize: 256,
      minzoom: AERIAL_ZOOM.min,
      maxzoom: AERIAL_ZOOM.max,
      bounds: AERIAL_BOUNDS,
      attribution: '<a href="https://www.lgl-bw.de" target="_blank" rel="noopener">© LGL BW</a>, <a href="https://www.govdata.de/dl-de/by-2-0" target="_blank" rel="noopener">dl-de/by-2-0</a>',
    };
    const first = st.layers.findIndex((l) => l.type === "symbol");
    st.layers.splice(first < 0 ? st.layers.length : first, 0, {
      id: "luftbild",
      type: "raster",
      source: "luftbild",
      minzoom: AERIAL_ZOOM.min,
      paint: { "raster-fade-duration": 150, "raster-contrast": 0.05 },
    });
  }
  cache.set(base, st);
  return structuredClone(st);
}
