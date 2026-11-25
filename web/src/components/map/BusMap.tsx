"use client";

// Karte des BürgerBus: MapLibre mit Luftbild (LGL BW, vorberechnet) bzw. dunkler Straßenkarte (OpenFreeMap),
// 3D-Bus und 3D-Haltestellen (three.js), Mitfahr-Kamera mit Gelände. Ohne API-Schlüssel.
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, Marker } from "maplibre-gl";
import { BASE_LABEL, TERRAIN, styleFor, type BaseMap } from "./styles";
import type { LayerStop } from "./StopLayer";
import type { LayerBus } from "./BusLayer";
import s from "./BusMap.module.css";

export interface MapBus {
  id: string;
  lon: number;
  lat: number;
  course: number;
  moving: boolean;
  label: string;
  color: string;
}
export interface MapLine {
  id: string;
  coords: [number, number][];
  color: string;
  width?: number;
  opacity?: number;
}
export interface MapPoint {
  id: string;
  lon: number;
  lat: number;
  label: string;
}

interface Props {
  getBus: () => MapBus[];
  onSelect?: (id: string) => void;
  lines: MapLine[];
  points?: MapPoint[];
  stops3d?: LayerStop[];
  /** ändert sich → auf Linien/Punkte zoomen */
  fitKey?: string;
  fitPadding?: { top: number; bottom: number; left: number; right: number };
  /** Mitfahr-Kamera: folgt dem Bus geneigt, in Fahrtrichtung, mit Gelände */
  follow?: { pitch: number; zoom: number; pad: { top: number; bottom: number; left: number; right: number } } | null;
  /** schwächere Handys: kein Gelände, weniger Pixel */
  lite?: boolean;
  className?: string;
}

const STORE = "bb-wehr-karte";
const ACCENT = 0xf2a516;
const readBase = (): BaseMap => {
  try {
    return localStorage.getItem(STORE) === "karte" ? "karte" : "luftbild";
  } catch {
    return "luftbild";
  }
};

export default function BusMap({ getBus, onSelect, lines, points = [], stops3d, fitKey, fitPadding, follow = null, lite = false, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [base, setBase] = useState<BaseMap>("luftbild");
  const [ready, setReady] = useState(0);
  const busLayer = useRef<{ update: (v: LayerBus[]) => void } | null>(null);
  const stopLayer = useRef<{ update: (v: LayerStop[]) => void } | null>(null);
  const markers = useRef(new Map<string, { m: Marker; el: HTMLButtonElement }>());
  const pointMarkers = useRef<Marker[]>([]);
  const has3d = useRef(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const stopsRef = useRef(stops3d);
  stopsRef.current = stops3d;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const followRef = useRef(follow);
  followRef.current = follow;

  // Karte anlegen (erst wenn der Kartenstil geladen ist)
  useEffect(() => {
    if (!el.current) return;
    if (!maplibregl.getWorkerUrl().includes("/maplibre/")) maplibregl.setWorkerUrl(`${window.location.origin}/maplibre/maplibre-gl-worker.mjs`);
    const b = readBase();
    setBase(b);
    let alive = true;
    let ro: ResizeObserver | null = null;
    let m: MLMap | null = null;
    styleFor(b, window.location.origin)
      .then((style) => {
        if (!alive || !el.current) return;
        m = new maplibregl.Map({
          container: el.current,
          style,
          center: [7.905, 47.615],
          zoom: 13,
          attributionControl: { compact: true },
          maxPitch: 70,
          pixelRatio: Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2),
          maxTileCacheSize: lite ? 150 : 400,
          refreshExpiredTiles: false,
          ...(lite ? { fadeDuration: 0 } : {}),
        });
        const mm = m;
        map.current = mm;
        (el.current as HTMLDivElement & { __ml?: MLMap }).__ml = mm; // Fehlersuche im Browser
        mm.on("style.load", () => {
          setReady((r) => r + 1);
          import("./StopLayer")
            .then(({ createStopLayer }) => {
              if (map.current !== mm || mm.getLayer("stops-3d")) return;
              const layer = createStopLayer();
              stopLayer.current = layer;
              mm.addLayer(layer, mm.getLayer("bus-3d") ? "bus-3d" : undefined);
              layer.update(stopsRef.current ?? []);
            })
            .catch(() => {});
          import("./BusLayer")
            .then(({ createBusLayer }) => {
              if (map.current !== mm || mm.getLayer("bus-3d")) return;
              const layer = createBusLayer(ACCENT);
              busLayer.current = layer;
              mm.addLayer(layer);
              has3d.current = true;
            })
            .catch(() => (has3d.current = false));
        });
        // Sicherheitsnetz: Container beim Anlegen noch nicht ausgemessen → Größe kurz danach neu bestimmen
        const kick = () => [300, 1200, 3000].forEach((ms) => window.setTimeout(() => map.current === mm && (mm.resize(), mm.triggerRepaint()), ms));
        mm.on("load", kick);
        mm.on("style.load", kick);
        mm.once("load", () => el.current?.querySelector(".maplibregl-compact-show")?.classList.remove("maplibregl-compact-show"));
        ro = new ResizeObserver(() => mm.resize());
        ro.observe(el.current);
      })
      .catch((e) => console.error("Kartenstil nicht geladen", e));
    return () => {
      alive = false;
      ro?.disconnect();
      markers.current.forEach(({ m: mk }) => mk.remove());
      markers.current.clear();
      m?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchBase = (b: BaseMap) => {
    setBase(b);
    try {
      localStorage.setItem(STORE, b);
    } catch {}
    const m = map.current;
    if (!m) return;
    busLayer.current = null;
    stopLayer.current = null;
    styleFor(b, window.location.origin)
      .then((st) => map.current === m && m.setStyle(st, { diff: false }))
      .catch((e) => console.error("Kartenstil nicht geladen", e));
  };

  // Gelände nur in der Mitfahr-Ansicht (Hänge des Wehratals), sonst flach und leicht
  const camOn = Boolean(follow);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (camOn && !lite) {
      if (!m.getSource("terrain")) m.addSource("terrain", TERRAIN);
      m.setTerrain({ source: "terrain", exaggeration: 1 });
    } else if (m.getTerrain()) m.setTerrain(null);
  }, [camOn, ready, lite]);

  // Mitfahr-Kamera ein/aus
  const camPending = useRef(false);
  const camWas = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (camOn) camPending.current = true;
    else if (camWas.current) {
      m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      m.easeTo({ pitch: 0, bearing: 0, duration: 900 });
    }
    camWas.current = camOn;
  }, [camOn]);

  // Linien nach jedem Stilwechsel neu setzen
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const want = new Set(lines.map((l) => `ln-${l.id}`));
    for (const layer of m.getStyle().layers ?? []) if (layer.id.startsWith("ln-") && !want.has(layer.id.replace(/-casing$/, ""))) m.removeLayer(layer.id);
    for (const id of Object.keys(m.getStyle().sources ?? {})) if (id.startsWith("ln-") && !want.has(id)) m.removeSource(id);
    const below = m.getLayer("stops-3d") ? "stops-3d" : m.getLayer("bus-3d") ? "bus-3d" : undefined;
    for (const l of lines) {
      const id = `ln-${l.id}`;
      const data = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: l.coords } };
      const src = m.getSource(id) as maplibregl.GeoJSONSource | undefined;
      const w = l.width ?? 4;
      if (src) {
        src.setData(data);
        m.setPaintProperty(id, "line-color", l.color);
        m.setPaintProperty(id, "line-width", w);
        m.setPaintProperty(id, "line-opacity", l.opacity ?? 0.95);
        m.setPaintProperty(`${id}-casing`, "line-width", w + 3);
        m.setPaintProperty(`${id}-casing`, "line-opacity", (l.opacity ?? 0.95) * 0.55);
        continue;
      }
      m.addSource(id, { type: "geojson", data });
      // dunkle Kontur: Linien bleiben auf dem hellen Luftbild gut lesbar
      m.addLayer({ id: `${id}-casing`, type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0b0c0e", "line-width": w + 3, "line-opacity": (l.opacity ?? 0.95) * 0.55 } }, below);
      m.addLayer({ id, type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": l.color, "line-width": w, "line-opacity": l.opacity ?? 0.95 } }, below);
    }
  }, [lines, ready]);

  useEffect(() => {
    stopLayer.current?.update(stops3d ?? []);
  }, [stops3d, ready]);

  // Beschriftete Punkte (Ihre Haltestelle, nächster Halt)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    pointMarkers.current.forEach((p) => p.remove());
    pointMarkers.current = points.map((p) => {
      const d = document.createElement("div");
      d.className = s.label;
      d.textContent = p.label;
      return new maplibregl.Marker({ element: d, anchor: "bottom-left", offset: [10, -26] }).setLngLat([p.lon, p.lat]).addTo(m);
    });
  }, [points]);

  // Auf Inhalte zoomen
  useEffect(() => {
    const m = map.current;
    if (!m || !fitKey || followRef.current) return;
    const all = [...linesRef.current.flatMap((l) => l.coords), ...points.map((p) => [p.lon, p.lat] as [number, number])];
    if (!all.length) return;
    const bb = new maplibregl.LngLatBounds(all[0], all[0]);
    all.forEach((c) => bb.extend(c));
    const W = m.getContainer().clientWidth, H = m.getContainer().clientHeight;
    let pad = fitPadding ?? { top: 60, bottom: 60, left: 60, right: 60 };
    if (pad.left + pad.right > W * 0.8 || pad.top + pad.bottom > H * 0.85) pad = { top: 60, bottom: Math.round(H * 0.45), left: 24, right: 24 };
    m.fitBounds(bb, { padding: pad, duration: 900, maxZoom: 16.5, bearing: 0, pitch: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready > 0]);

  // Bus animieren: 3D-Ebene jedes Frame, Marker darüber als Tippfläche (und Ersatz ohne 3D)
  useEffect(() => {
    let raf = 0;
    let lastFollow = 0;
    const loop = (ts: number) => {
      const m = map.current;
      if (m) {
        const vs = getBus();
        busLayer.current?.update(vs.map((v) => ({ id: v.id, lon: v.lon, lat: v.lat, course: v.course, moving: v.moving })));
        for (const [id, e] of markers.current)
          if (!vs.some((v) => v.id === id)) {
            e.m.remove();
            markers.current.delete(id);
          }
        for (const v of vs) {
          let e = markers.current.get(v.id);
          if (!e) {
            const d = document.createElement("button");
            d.type = "button";
            d.className = s.veh;
            d.setAttribute("aria-label", "Bürgerbus antippen");
            d.innerHTML = `<span class="${s.dot}"><svg viewBox="0 0 24 24" class="${s.arrow}"><path d="M12 3 19 20 12 16 5 20Z"/></svg></span><span class="${s.tag}"></span>`;
            d.addEventListener("click", (ev) => {
              ev.stopPropagation();
              onSelectRef.current?.(v.id);
            });
            e = { m: new maplibregl.Marker({ element: d }).setLngLat([v.lon, v.lat]).addTo(m), el: d };
            markers.current.set(v.id, e);
          }
          e.m.setLngLat([v.lon, v.lat]);
          e.el.dataset.three = has3d.current ? "1" : "0";
          e.el.style.setProperty("--c", v.color);
          e.el.style.setProperty("--rot", `${v.course - m.getBearing()}deg`);
          const tag = e.el.lastElementChild as HTMLSpanElement;
          if (tag.textContent !== v.label) tag.textContent = v.label;
          const cam = followRef.current;
          if (cam && ts - lastFollow > 900) {
            lastFollow = ts;
            if (camPending.current) {
              camPending.current = false;
              lastFollow = ts + 900;
              m.easeTo({ center: [v.lon, v.lat], zoom: cam.zoom, pitch: cam.pitch, bearing: v.course, padding: cam.pad, duration: 1600 });
            } else if (v.moving) {
              const cur = m.getBearing();
              const diff = ((((v.course - cur) % 360) + 540) % 360) - 180;
              m.easeTo({ center: [v.lon, v.lat], bearing: cur + Math.max(-20, Math.min(20, diff * 0.5)), padding: cam.pad, duration: 850, easing: (x) => x });
            } else m.easeTo({ center: [v.lon, v.lat], padding: cam.pad, duration: 850, easing: (x) => x });
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getBus]);

  return (
    <div className={`${s.wrap} ${className ?? ""}`}>
      <div ref={el} className={s.map} />
      <div className={s.controls} data-chrome="map">
        <div className={s.seg} role="group" aria-label="Kartenansicht">
          {(Object.keys(BASE_LABEL) as BaseMap[]).map((b) => (
            <button key={b} type="button" className={b === base ? s.on : ""} onClick={() => switchBase(b)} aria-pressed={b === base}>
              {BASE_LABEL[b]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
