// 3D-Bürgerbus als MapLibre-Custom-Layer mit three.js: schlichter Kleinbus aus Grundformen (kein fremdes Modell,
// keine Marken, keine Kennzeichen). Front zeigt entlang +Z (Norden), Kurs 0° = Norden.
import * as THREE from "three";
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MLMap } from "maplibre-gl";

export interface LayerBus {
  id: string;
  lon: number;
  lat: number;
  course: number;
  moving: boolean;
  selected?: boolean;
}

const LEN = 5.9; // Meter, Kleinbus mit 8 Fahrgastplätzen
const W = 2.0;
const MIN_PX = 44; // Mindestlänge auf dem Bildschirm

function busModel(accent: number) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xf1f2f4, metalness: 0.25, roughness: 0.42 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x18202a, metalness: 0.7, roughness: 0.18 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0.1, roughness: 0.8 });
  const stripe = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.2, roughness: 0.5 });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  const rear = new THREE.MeshBasicMaterial({ color: 0xd8262e });

  // Seitenprofil (z = Länge, y = Höhe), als Körper in Fahrzeugbreite extrudiert
  const z0 = -LEN / 2, z1 = LEN / 2;
  const p = new THREE.Shape();
  p.moveTo(z0, 0.38);
  p.lineTo(z0, 2.45);
  p.quadraticCurveTo(z0, 2.62, z0 + 0.2, 2.62);
  p.lineTo(z1 - 1.0, 2.62);
  p.quadraticCurveTo(z1 - 0.75, 2.62, z1 - 0.62, 2.35);
  p.lineTo(z1 - 0.12, 1.32); // Windschutzscheibe
  p.quadraticCurveTo(z1, 1.2, z1, 0.95);
  p.lineTo(z1, 0.38);
  p.lineTo(z0, 0.38);
  const body = new THREE.ExtrudeGeometry(p, { depth: W, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
  body.rotateY(-Math.PI / 2); // Profil-x → z, Breite → −x
  body.translate(W / 2, 0, 0);
  g.add(new THREE.Mesh(body, paint));

  // Fensterband rundum, Frontscheibe, Zierstreifen
  const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.72, LEN - 1.75), glass);
  band.position.set(0, 1.86, z0 + (LEN - 1.75) / 2 + 0.12);
  g.add(band);
  const wsLen = Math.hypot(0.5, 1.03);
  const ws = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, wsLen, 0.06), glass);
  ws.position.set(0, 1.84, z1 - 0.38);
  ws.rotation.x = Math.atan2(0.5, 1.03);
  g.add(ws);
  const st = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.2, LEN - 0.3), stripe);
  st.position.set(0, 1.18, 0);
  g.add(st);
  // Leuchten
  for (const x of [-0.72, 0.72]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.05), lamp);
    h.position.set(x, 0.86, z1 + 0.03);
    g.add(h);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.05), rear);
    r.position.set(x * 1.25, 1.1, z0 - 0.03);
    g.add(r);
  }
  // Räder
  const wheel = new THREE.CylinderGeometry(0.37, 0.37, 0.26, 20);
  wheel.rotateZ(Math.PI / 2);
  for (const z of [z1 - 1.0, z0 + 1.15]) for (const x of [-(W / 2 - 0.08), W / 2 - 0.08]) {
    const w = new THREE.Mesh(wheel, dark);
    w.position.set(x, 0.37, z);
    g.add(w);
  }
  // Schatten
  const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.38, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  sh.scale.set(W * 0.62, LEN * 0.56, 1);
  sh.position.y = 0.02;
  g.add(sh);
  return g;
}

export function createBusLayer(accent = 0xf2a516) {
  let map: MLMap;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const entries = new Map<string, THREE.Group>();
  let latest: LayerBus[] = [];
  let lastPaint = 0;

  const layer: CustomLayerInterface & { update: (v: LayerBus[]) => void } = {
    id: "bus-3d",
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl as WebGLRenderingContext, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a2e, 2.3));
      const sun = new THREE.DirectionalLight(0xffffff, 2.1);
      sun.position.set(-0.6, 1, 0.4);
      scene.add(sun);
      const rim = new THREE.DirectionalLight(0xffe2b8, 0.8);
      rim.position.set(0.7, 0.6, -0.6);
      scene.add(rim);
    },
    update(vs) {
      latest = vs;
      if (!map) return;
      const now = performance.now();
      const interval = map.getZoom() >= 12.5 ? 0 : 50;
      if ((vs.some((v) => v.moving) || entries.size !== vs.length) && now - lastPaint >= interval) {
        lastPaint = now;
        map.triggerRepaint();
      }
    },
    render(_gl, args: CustomRenderMethodInput) {
      if (!renderer) return;
      const zoom = map.getZoom();
      // relativ zum Kartenmittelpunkt rechnen (sonst 32-Bit-Splitter)
      const origin = MercatorCoordinate.fromLngLat(map.getCenter());
      for (const v of latest) {
        let root = entries.get(v.id);
        if (!root) {
          root = new THREE.Group();
          root.add(busModel(accent));
          root.matrixAutoUpdate = false;
          root.traverse((o) => (o.frustumCulled = false));
          scene.add(root);
          entries.set(v.id, root);
        }
        const elev = map.terrain ? (map.queryTerrainElevation([v.lon, v.lat]) ?? 0) : 0;
        const mc = MercatorCoordinate.fromLngLat([v.lon, v.lat], elev);
        const unit = mc.meterInMercatorCoordinateUnits();
        const mpp = (40075016.686 * Math.cos((v.lat * Math.PI) / 180)) / (512 * 2 ** zoom);
        const k = Math.max(1, (MIN_PX * mpp) / LEN) * (v.selected ? 1.12 : 1);
        const s = k * unit;
        root.matrix
          .makeTranslation(mc.x - origin.x, mc.y - origin.y, mc.z)
          .scale(new THREE.Vector3(s, s, s))
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
          .multiply(new THREE.Matrix4().makeRotationY((v.course * Math.PI) / 180));
        root.matrixWorldNeedsUpdate = true;
      }
      for (const [id, root] of entries)
        if (!latest.some((v) => v.id === id)) {
          scene.remove(root);
          entries.delete(id);
        }
      camera.projectionMatrix = new THREE.Matrix4()
        .fromArray(args.defaultProjectionData.mainMatrix as unknown as number[])
        .multiply(new THREE.Matrix4().makeTranslation(origin.x, origin.y, 0));
      renderer.resetState();
      const c = map.getCanvas();
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      if (size.x !== c.width || size.y !== c.height) {
        renderer.setPixelRatio(1);
        renderer.setSize(c.width, c.height, false);
      }
      renderer.setViewport(0, 0, c.width, c.height);
      renderer.clearDepth();
      renderer.render(scene, camera);
    },
    onRemove() {
      entries.forEach((r) => scene.remove(r));
      entries.clear();
    },
  };
  return layer;
}
