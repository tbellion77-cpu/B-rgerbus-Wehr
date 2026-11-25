// 3D-Haltestellen: Mast mit rundem H-Schild (gelb/grün wie Zeichen 224) als MapLibre-Custom-Layer mit three.js.
// Das Schild dreht und neigt sich zur Kamera, damit es in Draufsicht und Mitfahr-Ansicht lesbar bleibt.
import * as THREE from "three";
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MLMap } from "maplibre-gl";

export interface LayerStop {
  id: string;
  lon: number;
  lat: number;
  /** Haltestelle des Fahrgasts: größer, mit rotem Bodenring */
  mine?: boolean;
}

const HEIGHT_M = 3.2;
const MIN_PX = 46; // Mindesthöhe auf dem Bildschirm
const MINE = 0xf2a516; // Akzent: Ihre Haltestelle

function signTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1c7c3c";
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#f6cf16";
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#1c7c3c";
  g.font = "bold 76px Arial, Helvetica, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("H", 64, 69);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface Entry {
  root: THREE.Group;
  sign: THREE.Group;
  ring: THREE.Mesh;
}

export function createStopLayer() {
  let map: MLMap;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const entries = new Map<string, Entry>();
  let latest: LayerStop[] = [];

  let poleGeo: THREE.CylinderGeometry, discGeo: THREE.CircleGeometry, rimGeo: THREE.RingGeometry, ringGeo: THREE.RingGeometry, shadowGeo: THREE.CircleGeometry;
  let poleMat: THREE.Material, signMat: THREE.Material, rimMat: THREE.Material, ringMat: THREE.Material, shadowMat: THREE.Material;

  const build = (): Entry => {
    const root = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 0.36;
    root.add(pole);
    const sign = new THREE.Group();
    sign.position.y = 0.95;
    sign.rotation.order = "YXZ";
    const disc = new THREE.Mesh(discGeo, signMat);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.z = -0.002;
    sign.add(disc, rim);
    root.add(sign);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    root.add(shadow);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    root.add(ring);
    root.matrixAutoUpdate = false;
    root.traverse((o) => (o.frustumCulled = false));
    scene.add(root);
    return { root, sign, ring };
  };

  const layer: CustomLayerInterface & { update: (s: LayerStop[]) => void } = {
    id: "stops-3d",
    type: "custom",
    renderingMode: "3d",

    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl as WebGLRenderingContext, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a2e, 2.2));
      const sun = new THREE.DirectionalLight(0xffffff, 1.8);
      sun.position.set(-0.6, 1, 0.4);
      scene.add(sun);
      poleGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.72, 12);
      discGeo = new THREE.CircleGeometry(0.26, 48);
      rimGeo = new THREE.RingGeometry(0.255, 0.285, 48);
      ringGeo = new THREE.RingGeometry(0.22, 0.3, 48);
      shadowGeo = new THREE.CircleGeometry(0.12, 24);
      poleMat = new THREE.MeshStandardMaterial({ color: 0xb9bdc4, metalness: 0.6, roughness: 0.35 });
      signMat = new THREE.MeshBasicMaterial({ map: signTexture(), side: THREE.DoubleSide, transparent: true });
      rimMat = new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide });
      ringMat = new THREE.MeshBasicMaterial({ color: MINE, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
      shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
    },

    update(s) {
      latest = s;
      map?.triggerRepaint();
    },

    render(_gl, args: CustomRenderMethodInput) {
      if (!renderer || !poleGeo) return;
      const zoom = map.getZoom();
      const bearing = (map.getBearing() * Math.PI) / 180;
      const pitch = (map.getPitch() * Math.PI) / 180;
      const origin = MercatorCoordinate.fromLngLat(map.getCenter());
      for (const st of latest) {
        let e = entries.get(st.id);
        if (!e) {
          e = build();
          entries.set(st.id, e);
        }
        e.ring.visible = !!st.mine;
        // Schild zur Kamera drehen und um die Neigung zurücklehnen (Draufsicht: flach, lesbar)
        e.sign.rotation.set(-(Math.PI / 2 - pitch), bearing + Math.PI, 0);
        const elev = map.terrain ? (map.queryTerrainElevation([st.lon, st.lat]) ?? 0) : 0;
        const mc = MercatorCoordinate.fromLngLat([st.lon, st.lat], elev);
        const unit = mc.meterInMercatorCoordinateUnits();
        const mpp = (40075016.686 * Math.cos((st.lat * Math.PI) / 180)) / (512 * 2 ** zoom);
        const hM = Math.max(HEIGHT_M, MIN_PX * mpp) * (st.mine ? 1.35 : 1);
        const s = hM * unit;
        e.root.matrix
          .makeTranslation(mc.x - origin.x, mc.y - origin.y, mc.z)
          .scale(new THREE.Vector3(s, s, s))
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
        e.root.matrixWorldNeedsUpdate = true;
      }
      for (const [id, e] of entries)
        if (!latest.some((x) => x.id === id)) {
          scene.remove(e.root);
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
      entries.forEach((e) => scene.remove(e.root));
      entries.clear();
    },
  };
  return layer;
}
