// Luftbild für das Bediengebiet einmalig vorberechnen: Digitale Orthophotos 20 cm (DOP20) des LGL Baden-Württemberg
// per WMS holen, in Kacheln (z12–z18, WebP) zerlegen → public/luftbild/{z}/{x}/{y}.webp
// Lizenz: Datenlizenz Deutschland – Namensnennung 2.0 (dl-de/by-2-0), Quelle „© LGL, www.lgl-bw.de“.
// Aufruf: npm run luftbild   (dauert einige Minuten; nur nach Änderung des Bediengebiets nötig)
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "../public/luftbild");
const WMS = "https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C";
const ZMAX = 18, ZMIN = 12, BLOCK = 8, Q = 70, PAD = 0.006;

// Bediengebiet aus den Linienstrecken (wie src/components/map/styles.ts)
const net = JSON.parse(readFileSync(join(here, "../../data/network.json"), "utf8"));
const all = Object.values(net.lines).flatMap((l) => l.legs.flat());
const bb = [Math.min(...all.map((c) => c[0])) - PAD, Math.min(...all.map((c) => c[1])) - PAD, Math.max(...all.map((c) => c[0])) + PAD, Math.max(...all.map((c) => c[1])) + PAD];

const E = 20037508.342789244;
const tx = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const ty = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
const merc = (x, y, z) => [(x / 2 ** z) * 2 * E - E, E - (y / 2 ** z) * 2 * E];
const file = (z, x, y) => join(OUT, String(z), String(x), `${y}.webp`);

async function fetchBlock(x0, y0, n) {
  const [minx, maxy] = merc(x0, y0, ZMAX), [maxx, miny] = merc(x0 + n, y0 + n, ZMAX);
  const url = `${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=IMAGES_DOP_20_RGB&STYLES=&CRS=EPSG:3857&BBOX=${minx},${miny},${maxx},${maxy}&WIDTH=${n * 256}&HEIGHT=${n * 256}&FORMAT=image/jpeg`;
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "buergerbus-wehr-luftbild/1.0" } });
      if (r.ok && (r.headers.get("content-type") ?? "").startsWith("image/")) return Buffer.from(await r.arrayBuffer());
    } catch {}
    await new Promise((res) => setTimeout(res, 2000 * (a + 1)));
  }
  throw new Error(`WMS fehlgeschlagen: ${x0},${y0}`);
}

async function level18() {
  const X0 = tx(bb[0], ZMAX), X1 = tx(bb[2], ZMAX), Y0 = ty(bb[3], ZMAX), Y1 = ty(bb[1], ZMAX);
  const jobs = [];
  for (let bx = X0; bx <= X1; bx += BLOCK) for (let by = Y0; by <= Y1; by += BLOCK) jobs.push([bx, by]);
  console.log(`z${ZMAX}: ${(X1 - X0 + 1) * (Y1 - Y0 + 1)} Kacheln in ${jobs.length} Abrufen`);
  let done = 0;
  const work = async () => {
    for (let j; (j = jobs.shift()); ) {
      const [bx, by] = j;
      const need = [];
      for (let i = 0; i < BLOCK; i++) for (let k = 0; k < BLOCK; k++) {
        const x = bx + i, y = by + k;
        if (x <= X1 && y <= Y1 && !existsSync(file(ZMAX, x, y))) need.push([i, k]);
      }
      if (need.length) {
        const img = await fetchBlock(bx, by, BLOCK);
        for (const [i, k] of need) {
          mkdirSync(dirname(file(ZMAX, bx + i, by + k)), { recursive: true });
          await sharp(img).extract({ left: i * 256, top: k * 256, width: 256, height: 256 }).webp({ quality: Q }).toFile(file(ZMAX, bx + i, by + k));
        }
      }
      if (++done % 5 === 0) console.log(`  ${done} Abrufe fertig`);
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  return { X0, X1, Y0, Y1 };
}

async function pyramid({ X0, X1, Y0, Y1 }) {
  for (let z = ZMAX - 1; z >= ZMIN; z--) {
    const s = 2 ** (ZMAX - z);
    const a0 = Math.floor(X0 / s), a1 = Math.floor(X1 / s), b0 = Math.floor(Y0 / s), b1 = Math.floor(Y1 / s);
    let n = 0;
    for (let x = a0; x <= a1; x++) for (let y = b0; y <= b1; y++) {
      const parts = [];
      for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) {
        const f = file(z + 1, 2 * x + i, 2 * y + k);
        if (existsSync(f)) parts.push({ input: await sharp(f).resize(128, 128).toBuffer(), left: i * 128, top: k * 128 });
      }
      if (!parts.length) continue;
      mkdirSync(dirname(file(z, x, y)), { recursive: true });
      await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(parts).webp({ quality: Q }).toFile(file(z, x, y));
      n++;
    }
    console.log(`z${z}: ${n} Kacheln`);
  }
}

console.log("Bediengebiet", bb.map((v) => v.toFixed(4)).join(", "));
await pyramid(await level18());
console.log("fertig →", OUT);
