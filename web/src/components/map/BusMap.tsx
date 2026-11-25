"use client";

// Karte des BürgerBus auf Google Maps (Vektorkarte: Neigung und Drehung), Satellit mit Beschriftung oder Straßenkarte.
// 3D-Bus über WebGLOverlayView (three.js), Haltestellen als H-Schilder, Mitfahr-Kamera.
// Schlüssel: NEXT_PUBLIC_GOOGLE_MAPS_KEY (nur in .env.local bzw. beim Hoster, nie im Repo; in der Google Cloud
// auf die eigenen Domains beschränken). Eigene Karten-ID: NEXT_PUBLIC_GOOGLE_MAP_ID (sonst Google-Demo-ID).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
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
export interface MapStop {
  id: string;
  lon: number;
  lat: number;
  /** Haltestelle des Fahrgasts: größer, mit Ring */
  mine?: boolean;
}
type Pad = { top: number; bottom: number; left: number; right: number };

interface Props {
  getBus: () => MapBus[];
  onSelect?: (id: string) => void;
  onStop?: (id: string) => void;
  lines: MapLine[];
  points?: MapPoint[];
  stops?: MapStop[];
  /** ändert sich → auf Linien/Punkte zoomen */
  fitKey?: string;
  fitPadding?: Pad;
  /** Mitfahr-Kamera: folgt dem Bus geneigt und in Fahrtrichtung */
  follow?: { tilt: number; zoom: number } | null;
  className?: string;
}

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";
const STORE = "bb-wehr-karte";
const ACCENT = 0xf2a516;
type Base = "hybrid" | "roadmap";
const BASE_LABEL: Record<Base, string> = { hybrid: "Satellit", roadmap: "Karte" };

let configured = false;
function loadMaps() {
  if (!configured) {
    setOptions({ key: KEY, v: "weekly", language: "de", region: "DE" });
    configured = true;
  }
  return Promise.all([importLibrary("maps"), importLibrary("marker"), importLibrary("core")]) as Promise<any[]>;
}
const readBase = (): Base => {
  try {
    return localStorage.getItem(STORE) === "roadmap" ? "roadmap" : "hybrid";
  } catch {
    return "hybrid";
  }
};

/** 3D-Bus als WebGL-Ebene über der Google-Karte */
function createBusOverlay(g: any, getLatest: () => MapBus[], onReady: () => void) {
  const overlay = new g.maps.WebGLOverlayView();
  let THREE: typeof import("three") | null = null;
  let mod: typeof import("./BusModel") | null = null;
  let scene: any, camera: any, renderer: any;
  const roots = new Map<string, any>();
  let map: any;
  Promise.all([import("three"), import("./BusModel")]).then(([t, m]) => {
    THREE = t;
    mod = m;
    overlay.requestRedraw();
  });
  overlay.onAdd = () => {};
  overlay.onContextRestored = ({ gl }: { gl: WebGL2RenderingContext }) => {
    if (!THREE) return void setTimeout(() => overlay.onContextRestored({ gl }), 200);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a2e, 2.3));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(-0.6, 0.4, 1); // Kartenraum: z = oben
    scene.add(sun);
    renderer = new THREE.WebGLRenderer({ canvas: gl.canvas as HTMLCanvasElement, context: gl, ...gl.getContextAttributes() });
    renderer.autoClear = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    onReady();
  };
  overlay.onDraw = ({ transformer }: { gl: WebGL2RenderingContext; transformer: any }) => {
    if (!THREE || !mod || !renderer) return void overlay.requestRedraw();
    map = map ?? overlay.getMap();
    const vs = getLatest();
    const zoom = map?.getZoom?.() ?? 15;
    for (const [id, r] of roots)
      if (!vs.some((v) => v.id === id)) {
        scene.remove(r);
        roots.delete(id);
      }
    // ein Bus: Kamera am Bus verankern (Meter-Koordinaten x = Ost, y = Nord, z = oben)
    const v = vs[0];
    if (v) {
      let r = roots.get(v.id);
      if (!r) {
        r = new THREE.Group();
        const inner = mod.busModel(ACCENT);
        inner.rotation.x = Math.PI / 2; // Modell-Y (oben) → z
        r.add(inner);
        r.traverse((o: any) => (o.frustumCulled = false));
        scene.add(r);
        roots.set(v.id, r);
      }
      const mpp = (156543.03 * Math.cos((v.lat * Math.PI) / 180)) / 2 ** zoom;
      const k = Math.max(1, (mod.MIN_PX * mpp) / mod.LEN);
      r.scale.setScalar(k);
      r.rotation.z = Math.PI - (v.course * Math.PI) / 180;
      camera.projectionMatrix.fromArray(transformer.fromLatLngAltitude({ lat: v.lat, lng: v.lon, altitude: 0 }));
      renderer.render(scene, camera);
      renderer.resetState();
    }
    overlay.requestRedraw(); // dauerhaft zeichnen, solange die Karte offen ist
  };
  return overlay;
}

export default function BusMap({ getBus, onSelect, onStop, lines, points = [], stops = [], fitKey, fitPadding, follow = null, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const lib = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(KEY ? null : "Google-Kartenschlüssel fehlt (NEXT_PUBLIC_GOOGLE_MAPS_KEY in web/.env.local).");
  const [base, setBase] = useState<Base>("hybrid");
  const polys = useRef<any[]>([]);
  const stopMarkers = useRef<any[]>([]);
  const pointMarkers = useRef<any[]>([]);
  const busMarker = useRef<{ m: any; el: HTMLButtonElement } | null>(null);
  const latest = useRef<MapBus[]>([]);
  const has3d = useRef(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;
  const followRef = useRef(follow);
  followRef.current = follow;

  // Karte anlegen
  useEffect(() => {
    if (!KEY || !el.current) return;
    let alive = true;
    (window as any).gm_authFailure = () => setErr("Google hat den Kartenschlüssel abgelehnt (Maps JavaScript API nicht freigeschaltet oder Domain nicht erlaubt).");
    loadMaps()
      .then(([maps, marker, core]) => {
        if (!alive || !el.current) return;
        const b = readBase();
        setBase(b);
        const m = new maps.Map(el.current, {
          center: { lat: 47.615, lng: 7.905 },
          zoom: 14,
          mapId: MAP_ID,
          renderingType: "VECTOR",
          mapTypeId: b,
          tiltInteractionEnabled: true,
          headingInteractionEnabled: true,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        map.current = m;
        lib.current = { ...maps, ...marker, ...core, maps: (window as any).google.maps };
        (el.current as any).__gm = m; // Fehlersuche im Browser
        try {
          // 3D-Bus nur mit WebGL-Vektorkarte; sonst bleibt der Pfeil-Marker sichtbar
          const ov = createBusOverlay((window as any).google, () => latest.current, () => (has3d.current = true));
          ov.setMap(m);
        } catch {
          has3d.current = false;
        }
        setReady(true);
      })
      .catch((e) => setErr(`Google Maps konnte nicht geladen werden: ${String(e?.message ?? e)}`));
    return () => {
      alive = false;
    };
  }, []);

  const switchBase = (b: Base) => {
    setBase(b);
    try {
      localStorage.setItem(STORE, b);
    } catch {}
    map.current?.setMapTypeId(b);
  };

  // Linien: dunkle Kontur + Linienfarbe
  useEffect(() => {
    if (!ready) return;
    const { Polyline } = lib.current;
    polys.current.forEach((p) => p.setMap(null));
    polys.current = lines.flatMap((l) => {
      const path = l.coords.map(([lon, lat]) => ({ lat, lng: lon }));
      const w = l.width ?? 4;
      return [
        new Polyline({ map: map.current, path, strokeColor: "#0b0c0e", strokeOpacity: (l.opacity ?? 0.95) * 0.55, strokeWeight: w + 3, zIndex: 1, clickable: false }),
        new Polyline({ map: map.current, path, strokeColor: l.color, strokeOpacity: l.opacity ?? 0.95, strokeWeight: w, zIndex: 2, clickable: false }),
      ];
    });
  }, [lines, ready]);

  // Haltestellen als H-Schilder (antippbar)
  useEffect(() => {
    if (!ready) return;
    const { AdvancedMarkerElement } = lib.current;
    stopMarkers.current.forEach((m) => (m.map = null));
    stopMarkers.current = stops.map((st) => {
      const d = document.createElement("div");
      d.className = `${s.hsign} ${st.mine ? s.mine : ""}`;
      d.textContent = "H";
      const m = new AdvancedMarkerElement({ map: map.current, position: { lat: st.lat, lng: st.lon }, content: d, zIndex: st.mine ? 20 : 10, gmpClickable: true });
      m.addEventListener("gmp-click", () => onStopRef.current?.(st.id));
      return m;
    });
  }, [stops, ready]);

  // Beschriftungen (Ihre Haltestelle, nächster Halt)
  useEffect(() => {
    if (!ready) return;
    const { AdvancedMarkerElement } = lib.current;
    pointMarkers.current.forEach((m) => (m.map = null));
    pointMarkers.current = points.map((p) => {
      const d = document.createElement("div");
      d.className = `${s.label} ${s.glabel}`;
      d.textContent = p.label;
      return new AdvancedMarkerElement({ map: map.current, position: { lat: p.lat, lng: p.lon }, content: d, zIndex: 30 });
    });
  }, [points, ready]);

  // Auf Inhalte zoomen
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !fitKey || followRef.current) return;
    const all = [...linesRef.current.flatMap((l) => l.coords), ...points.map((p) => [p.lon, p.lat] as [number, number])];
    if (!all.length) return;
    const b = new lib.current.LatLngBounds();
    all.forEach(([lon, lat]) => b.extend({ lat, lng: lon }));
    const W = el.current!.clientWidth, H = el.current!.clientHeight;
    let pad = fitPadding ?? { top: 60, bottom: 60, left: 60, right: 60 };
    if (pad.left + pad.right > W * 0.8 || pad.top + pad.bottom > H * 0.85) pad = { top: 60, bottom: Math.round(H * 0.45), left: 24, right: 24 };
    m.moveCamera({ tilt: 0, heading: 0 });
    m.fitBounds(b, pad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready]);

  // Mitfahr-Kamera aus → zurück in die Draufsicht
  const camOn = Boolean(follow);
  const camWas = useRef(false);
  useEffect(() => {
    if (!camOn && camWas.current) map.current?.moveCamera({ tilt: 0, heading: 0 });
    camWas.current = camOn;
  }, [camOn]);

  // Bus: Position jedes Frame, Kamera höchstens alle 700 ms nachführen (sonst lädt Google keine Kacheln nach)
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    let lastCam = 0;
    const { AdvancedMarkerElement } = lib.current;
    const loop = (ts: number) => {
      const m = map.current;
      const vs = getBus();
      latest.current = vs;
      const v = vs[0];
      if (!v && busMarker.current) {
        busMarker.current.m.map = null;
        busMarker.current = null;
      }
      if (v) {
        if (!busMarker.current) {
          const d = document.createElement("button");
          d.type = "button";
          d.className = `${s.veh} ${s.gveh}`;
          d.setAttribute("aria-label", "Bürgerbus antippen");
          d.innerHTML = `<span class="${s.dot}"><svg viewBox="0 0 24 24" class="${s.arrow}"><path d="M12 3 19 20 12 16 5 20Z"/></svg></span><span class="${s.tag}"></span>`;
          d.addEventListener("click", (ev) => {
            ev.stopPropagation();
            onSelectRef.current?.(v.id);
          });
          busMarker.current = { m: new AdvancedMarkerElement({ map: m, position: { lat: v.lat, lng: v.lon }, content: d, zIndex: 50 }), el: d };
        }
        const { m: mk, el: e } = busMarker.current;
        mk.position = { lat: v.lat, lng: v.lon };
        e.dataset.three = has3d.current ? "1" : "0";
        e.style.setProperty("--c", v.color);
        e.style.setProperty("--rot", `${v.course - (m.getHeading?.() ?? 0)}deg`);
        const tag = e.lastElementChild as HTMLSpanElement;
        if (tag.textContent !== v.label) tag.textContent = v.label;
        const cam = followRef.current;
        if (cam && ts - lastCam > 700) {
          lastCam = ts;
          // sanft in Fahrtrichtung drehen (höchstens 25° je Schritt)
          const cur = m.getHeading?.() ?? 0;
          const diff = ((((v.course - cur) % 360) + 540) % 360) - 180;
          const heading = v.moving ? cur + Math.max(-25, Math.min(25, diff * 0.6)) : cur;
          m.moveCamera({ center: { lat: v.lat, lng: v.lon }, zoom: cam.zoom, tilt: cam.tilt, heading });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getBus, ready]);

  return (
    <div className={`${s.wrap} ${className ?? ""}`}>
      <div ref={el} className={s.map} />
      {err && <div className={s.nokey}>{err}</div>}
      {!err && (
        <div className={s.controls} data-chrome="map">
          <div className={s.seg} role="group" aria-label="Kartenansicht">
            {(Object.keys(BASE_LABEL) as Base[]).map((b) => (
              <button key={b} type="button" className={b === base ? s.on : ""} onClick={() => switchBase(b)} aria-pressed={b === base}>
                {BASE_LABEL[b]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
